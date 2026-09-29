import { AppError } from '../../lib/AppError.js';
import { assertPoolTransition, assertRequestTransition } from '../../domain/transitions.js';
import { canJoin } from '../../domain/matching.js';
import { qualifiesForPoolDiscount, settleFare } from '../../domain/fare.js';
import {
  createEvent,
  attachToPool,
  cancelRequest,
  findInPool,
  listInPool,
  countInPool,
  updateRequest,
  updateManyInPool,
} from '../rides/rides.repository.js';
import * as driverRepository from '../driver/driver.repository.js';
import * as poolsRepository from './pools.repository.js';

// Locks the pool for the rest of the transaction and returns its fresh state.
// Lock order is ALWAYS pool first, then request rows: two transactions that take
// locks in the same order can wait on each other but never deadlock (rules.md B8).
export async function lockPool(tx, poolId) {
  const pool = await poolsRepository.lockPool(tx, poolId);
  if (!pool) throw new AppError('POOL_NOT_FOUND', 404, 'Pool not found');
  return pool;
}

// Puts a just-created REQUESTED ride into an open shared pool, if one fits (rules.md B5, B8).
// Returns the pool id, or null when nothing fits. That is NOT an error: the ride simply stays
// REQUESTED so a driver can accept it. Runs inside the caller's transaction.
export async function tryAutoJoin(tx, request, adjacency) {
  if (!request.allowPool) return null;

  const candidates = await poolsRepository.findJoinableCandidateIds(tx, {
    pickupZoneId: request.pickupZoneId,
    seats: request.seats,
  });

  for (const { id } of candidates) {
    // THE RACE FIX: if another transaction is joining or changing this pool, we WAIT here.
    // Everything below is then read fresh, so Nusrat and Shirin can't both take the last seat.
    const pool = await lockPool(tx, id);
    const members = await poolsRepository.listMembers(tx, pool.id);

    // The shortlist was read without a lock and may be stale: decide on the locked, fresh data
    if (!canJoin(pool, members, request, adjacency).ok) continue;

    assertRequestTransition('REQUESTED', 'MATCHED');
    const attached = await attachToPool(tx, { id: request.id, poolId: pool.id });
    if (!attached) return null; // the request itself changed underneath us: leave it alone

    await poolsRepository.addSeats(tx, pool.id, request.seats);
    await createEvent(tx, {
      rideRequestId: request.id,
      poolId: pool.id,
      fromStatus: 'REQUESTED',
      toStatus: 'MATCHED',
      actorUserId: request.passengerId,
      reason: 'AUTO_JOIN',
    });
    return pool.id;
  }

  return null;
}

// A passenger leaves the pool (cancelled, or marked no-show by the driver): free their seats,
// and if nobody is left, the trip has no passengers, so the pool is cancelled too.
// `pool` must be the row returned by lockPool in this same transaction.
export async function removeMember(tx, pool, seats, actorUserId) {
  const freed = await poolsRepository.releaseSeats(tx, pool.id, seats);
  if (!freed) {
    // Cannot happen if seats_taken matches the members. If it does, fail loudly and roll back.
    throw new Error(`Pool ${pool.id} has fewer than ${seats} seats taken`);
  }

  if (pool.seatsTaken - seats > 0) return { poolCancelled: false };

  // "Last member cancels" only ever happens before the trip starts: STARTED passengers can't leave
  assertPoolTransition(pool.status, 'CANCELLED');
  await poolsRepository.cancelPool(tx, pool.id);
  await createEvent(tx, {
    poolId: pool.id,
    fromStatus: pool.status,
    toStatus: 'CANCELLED',
    actorUserId,
    reason: 'ALL_MEMBERS_CANCELLED',
  });
  return { poolCancelled: true };
}

// --- The driver's side of a trip -------------------------------------------------------------
// arrive -> start -> drop off each passenger. Every action takes the locks in the same order:
// vehicle, then pool, then request rows. Every status change goes through the transition table
// and writes a ride_events row.

// What the driver sees: names, seats and destinations of their OWN pool only (rules.md B9)
function toPoolView(pool, requests) {
  return {
    id: pool.id,
    status: pool.status,
    isShared: pool.isShared,
    pickupZone: { id: pool.pickupZone.id, name: pool.pickupZone.name },
    capacity: pool.capacity,
    seatsTaken: pool.seatsTaken,
    seatsLeft: pool.capacity - pool.seatsTaken,
    arrivedAt: pool.arrivedAt,
    startedAt: pool.startedAt,
    completedAt: pool.completedAt,
    cancelledAt: pool.cancelledAt,
    passengers: requests.map((request) => ({
      requestId: request.id,
      name: request.passenger.name,
      seats: request.seats,
      destination: { id: request.destZone.id, name: request.destZone.name },
      status: request.status,
      fare: {
        estimatedSolo: request.estSoloFare,
        estimatedPooled: request.estPooledFare,
        final: request.finalFare, // null until the trip starts
      },
    })),
  };
}

// Exported: accepting a ride returns the same view
export async function getPoolView(db, poolId) {
  const pool = await poolsRepository.findPoolWithZone(db, poolId);
  const requests = await listInPool(db, poolId);
  return toPoolView(pool, requests);
}

async function findDriverVehicle(tx, driverId) {
  const vehicle = await driverRepository.findVehicleByDriver(tx, driverId);
  if (!vehicle) throw new AppError('VEHICLE_NOT_FOUND', 404, 'No vehicle is registered to this driver');
  return vehicle;
}

// Locks the driver's vehicle, then their active pool, and returns the pool's fresh state.
// A driver can only ever reach their own pool this way: someone else's is "no active trip".
async function lockDriverPool(tx, driverId) {
  const vehicle = await findDriverVehicle(tx, driverId);
  await driverRepository.lockVehicle(tx, vehicle.id);

  const active = await poolsRepository.findActivePoolByVehicle(tx, vehicle.id);
  if (!active) throw new AppError('NO_ACTIVE_POOL', 404, 'You have no active trip');

  return lockPool(tx, active.id);
}

export function getCurrentPool(driverId) {
  return poolsRepository.inTransaction(async (tx) => {
    const vehicle = await findDriverVehicle(tx, driverId);
    const active = await poolsRepository.findActivePoolByVehicle(tx, vehicle.id);
    return active ? getPoolView(tx, active.id) : null;
  });
}

// The driver has reached the pickup zone. The whole pool arrives at once (everyone shares the
// pickup zone), and from now on nobody else can join (canJoin requires MATCHED).
export function arrive(driverId) {
  return poolsRepository.inTransaction(async (tx) => {
    const pool = await lockDriverPool(tx, driverId);
    assertPoolTransition(pool.status, 'DRIVER_ARRIVED');

    const members = await listInPool(tx, pool.id);
    assertRequestTransition('MATCHED', 'DRIVER_ARRIVED');

    await poolsRepository.updatePool(tx, pool.id, { status: 'DRIVER_ARRIVED', arrivedAt: new Date() });
    await updateManyInPool(tx, pool.id, ['MATCHED'], { status: 'DRIVER_ARRIVED' });

    await createEvent(tx, {
      poolId: pool.id,
      fromStatus: pool.status,
      toStatus: 'DRIVER_ARRIVED',
      actorUserId: driverId,
    });
    for (const member of members.filter((request) => request.status === 'MATCHED')) {
      await createEvent(tx, {
        rideRequestId: member.id,
        poolId: pool.id,
        fromStatus: 'MATCHED',
        toStatus: 'DRIVER_ARRIVED',
        actorUserId: driverId,
      });
    }

    return getPoolView(tx, pool.id);
  });
}

// The trip begins, and this is where the FINAL FARES ARE LOCKED (rules.md B6): the pool discount
// applies only if 2 or more passengers are actually aboard. If Rafiq cancelled or was a no-show,
// Nusrat pays the solo price.
export function start(driverId) {
  return poolsRepository.inTransaction(async (tx) => {
    const pool = await lockDriverPool(tx, driverId);
    assertPoolTransition(pool.status, 'STARTED');

    const aboard = (await listInPool(tx, pool.id)).filter((request) => request.status === 'DRIVER_ARRIVED');
    if (aboard.length === 0) {
      throw new AppError('NO_PASSENGERS', 409, 'There are no passengers to start the trip with');
    }

    const pooled = qualifiesForPoolDiscount(aboard.length);
    assertRequestTransition('DRIVER_ARRIVED', 'STARTED');

    for (const request of aboard) {
      const { poolDiscount, finalFare } = settleFare(request, pooled);
      await updateRequest(tx, request.id, { status: 'STARTED', poolDiscount, finalFare });
      await createEvent(tx, {
        rideRequestId: request.id,
        poolId: pool.id,
        fromStatus: 'DRIVER_ARRIVED',
        toStatus: 'STARTED',
        actorUserId: driverId,
        reason: pooled ? 'POOL_DISCOUNT_APPLIED' : 'NO_POOL_DISCOUNT',
      });
    }

    await poolsRepository.updatePool(tx, pool.id, { status: 'STARTED', startedAt: new Date() });
    await createEvent(tx, {
      poolId: pool.id,
      fromStatus: pool.status,
      toStatus: 'STARTED',
      actorUserId: driverId,
    });

    return getPoolView(tx, pool.id);
  });
}

// One passenger reaches their destination. The pool completes by itself when nobody is left aboard.
export function dropOff(driverId, requestId) {
  return poolsRepository.inTransaction(async (tx) => {
    const pool = await lockDriverPool(tx, driverId);

    const request = await findInPool(tx, requestId, pool.id);
    if (!request) throw new AppError('RIDE_NOT_FOUND', 404, 'That passenger is not in your trip');

    assertRequestTransition(request.status, 'COMPLETED'); // only a STARTED passenger can be dropped off

    // Payment is cash, recorded here at completion (rules.md B6)
    await updateRequest(tx, request.id, { status: 'COMPLETED', paymentMethod: 'CASH' });
    await createEvent(tx, {
      rideRequestId: request.id,
      poolId: pool.id,
      fromStatus: 'STARTED',
      toStatus: 'COMPLETED',
      actorUserId: driverId,
    });

    if ((await countInPool(tx, pool.id, 'STARTED')) === 0) {
      assertPoolTransition(pool.status, 'COMPLETED');
      await poolsRepository.updatePool(tx, pool.id, { status: 'COMPLETED', completedAt: new Date() });
      await createEvent(tx, {
        poolId: pool.id,
        fromStatus: pool.status,
        toStatus: 'COMPLETED',
        actorUserId: driverId,
      });

      // The trip just ended here, with this passenger: while STARTED, the zone can't affect
      // matching anyway (a sealed pool takes no new members), so updating it once now - rather
      // than after every drop-off - gives the same result with one write instead of several.
      await driverRepository.updateVehicleZoneByDriver(tx, driverId, request.destZoneId);
    }

    return getPoolView(tx, pool.id);
  });
}

// The driver reached the pickup and this passenger never showed up. Only after arrival.
export function markNoShow(driverId, requestId) {
  return poolsRepository.inTransaction(async (tx) => {
    const pool = await lockDriverPool(tx, driverId);

    const request = await findInPool(tx, requestId, pool.id);
    if (!request) throw new AppError('RIDE_NOT_FOUND', 404, 'That passenger is not in your trip');

    if (request.status !== 'DRIVER_ARRIVED') {
      throw new AppError(
        'INVALID_TRANSITION',
        409,
        'A passenger can only be marked as a no-show after you have arrived and before the trip starts',
        { from: request.status, to: 'CANCELLED' },
      );
    }
    assertRequestTransition(request.status, 'CANCELLED');

    const cancelled = await cancelRequest(tx, {
      id: request.id,
      fromStatus: request.status,
      cancelledBy: driverId,
      reason: 'NO_SHOW',
    });
    if (!cancelled) throw new AppError('RIDE_CHANGED', 409, 'This ride was just updated, please refresh and try again');

    await createEvent(tx, {
      rideRequestId: request.id,
      poolId: pool.id,
      fromStatus: request.status,
      toStatus: 'CANCELLED',
      actorUserId: driverId,
      reason: 'NO_SHOW',
    });

    // Frees their seats, and cancels the pool if nobody is left
    await removeMember(tx, pool, request.seats, driverId);

    return getPoolView(tx, pool.id);
  });
}

// The driver gives up the trip before it starts. Passengers are NOT punished: they go straight back
// to REQUESTED (with a fresh 10 minutes) so another driver can pick them up (rules.md B7).
export function cancelTrip(driverId) {
  return poolsRepository.inTransaction(async (tx) => {
    const pool = await lockDriverPool(tx, driverId);
    assertPoolTransition(pool.status, 'CANCELLED'); // refused once STARTED

    const members = await listInPool(tx, pool.id);
    for (const member of members) assertRequestTransition(member.status, 'REQUESTED');

    await updateManyInPool(tx, pool.id, ['MATCHED', 'DRIVER_ARRIVED'], {
      status: 'REQUESTED',
      poolId: null,
      requestedAt: new Date(),
    });
    for (const member of members) {
      await createEvent(tx, {
        rideRequestId: member.id,
        poolId: pool.id,
        fromStatus: member.status,
        toStatus: 'REQUESTED',
        actorUserId: driverId,
        reason: 'DRIVER_CANCELLED',
      });
    }

    await poolsRepository.updatePool(tx, pool.id, { status: 'CANCELLED', cancelledAt: new Date(), seatsTaken: 0 });
    await createEvent(tx, {
      poolId: pool.id,
      fromStatus: pool.status,
      toStatus: 'CANCELLED',
      actorUserId: driverId,
      reason: 'DRIVER_CANCELLED',
    });

    return getPoolView(tx, pool.id);
  });
}
