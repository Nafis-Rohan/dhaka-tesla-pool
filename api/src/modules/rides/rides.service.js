import { AppError } from '../../lib/AppError.js';
import { estimate } from '../../domain/fare.js';
import { assertRequestTransition } from '../../domain/transitions.js';
import { getDistanceM, getAdjacency } from '../zones/zones.service.js';
import * as poolsService from '../pools/pools.service.js';
import * as ridesRepository from './rides.repository.js';


export const REQUEST_EXPIRY_MS = 10 * 60 * 1000;

// What the passenger sees: their own ride and their own fare only. Co-riders are just a count,
// never names or phones (privacy, rules.md B9). Money is integer paisa; the UI converts to taka.
export function toPassengerView(request, coPassengerCount = 0) {
  return {
    id: request.id,
    status: request.status,
    pickup: { id: request.pickupZone.id, name: request.pickupZone.name },
    destination: { id: request.destZone.id, name: request.destZone.name },
    seats: request.seats,
    allowPool: request.allowPool,
    fare: {
      estimatedSolo: request.estSoloFare,
      estimatedPooled: request.estPooledFare,
      poolDiscount: request.poolDiscount, // null until the trip starts
      final: request.finalFare, // null until the trip starts
    },
    coPassengerCount,
    requestedAt: request.requestedAt,
    expiresAt:
      request.status === 'REQUESTED'
        ? new Date(request.requestedAt.getTime() + REQUEST_EXPIRY_MS)
        : null,
  };
}

// Lazy expiry (no cron): expire this passenger's REQUESTED ride if it waited past 10 minutes.
// Runs before booking (an old REQUESTED ride still counts as "active" for the one-active-ride
// index, so the passenger could never book again) and before every read, so a stale ride
// shows as EXPIRED. It writes only when something is actually stale.
async function expireStaleRide(db, passengerId) {
  const expiredId = await ridesRepository.expireStaleRequest(
    db,
    passengerId,
    new Date(Date.now() - REQUEST_EXPIRY_MS),
  );
  if (!expiredId) return;

  assertRequestTransition('REQUESTED', 'EXPIRED');
  await ridesRepository.createEvent(db, {
    rideRequestId: expiredId,
    fromStatus: 'REQUESTED',
    toStatus: 'EXPIRED',
    reason: 'NOT_MATCHED_IN_TIME',
  });
}

// "sharing with N others": everyone else riding in the same pool, counted in one query for the whole list
async function toPassengerViews(db, rides) {
  const poolIds = [...new Set(rides.map((ride) => ride.poolId).filter(Boolean))];
  const memberCounts = await ridesRepository.countMembersByPool(db, poolIds);

  return rides.map((ride) => {
    const countsItself = ridesRepository.POOL_MEMBER_STATUSES.includes(ride.status) ? 1 : 0;
    const others = Math.max(0, (memberCounts.get(ride.poolId) ?? 0) - countsItself);
    return toPassengerView(ride, others);
  });
}

export async function createRide(passengerId, { pickupZoneId, destZoneId, seats, allowPool }) {
  // Reference data that never changes mid-request, so it stays outside the transaction
  const distanceM = await getDistanceM(pickupZoneId, destZoneId);
  const fare = estimate({ distanceM, seats });
  const adjacency = allowPool ? await getAdjacency() : null; // only needed when we try to join a pool

  try {
    return await ridesRepository.inTransaction(async (tx) => {
      // An old REQUESTED ride still counts as "active" for the one-active-ride-per-passenger index,
      // so expire it first or the passenger could never book again.
      await expireStaleRide(tx, passengerId);

      // Only the solo breakdown is stored now. Pool discount and final fare are decided when the trip starts.
      const request = await ridesRepository.createRequest(tx, {
        passengerId,
        pickupZoneId,
        destZoneId,
        seats,
        allowPool,
        baseFare: fare.breakdown.solo.baseFare,
        distanceCharge: fare.breakdown.solo.distanceCharge,
        estSoloFare: fare.solo,
        estPooledFare: fare.pooled,
      });

      // 'NONE' = the ride didn't exist before (from_status is NOT NULL)
      await ridesRepository.createEvent(tx, {
        rideRequestId: request.id,
        fromStatus: 'NONE',
        toStatus: 'REQUESTED',
        actorUserId: passengerId,
      });

      // Join an open Bullet if the matching rule allows it; otherwise the ride stays REQUESTED
      await poolsService.tryAutoJoin(tx, request, adjacency);

      // Read it back: joining changed its status and pool, and the response shows "sharing with N others"
      const saved = await ridesRepository.findByIdForPassenger(tx, request.id, passengerId);
      const [view] = await toPassengerViews(tx, [saved]);
      return view;
    });
  } catch (err) {
    // The partial unique index one_active_request_per_passenger is the real guard: it also stops
    // a double-clicked submit, which a "check first, then insert" would let through. P2002 = unique violation.
    if (err.code === 'P2002') {
      throw new AppError('ACTIVE_RIDE_EXISTS', 409, 'You already have an active ride');
    }
    throw err;
  }
}

// One transaction: expire anything stale, then read, so the answer is consistent.
export function listRides(passengerId, scope) {
  return ridesRepository.inTransaction(async (tx) => {
    await expireStaleRide(tx, passengerId);

    const rides =
      scope === 'history'
        ? await ridesRepository.listHistoryByPassenger(tx, passengerId)
        : await ridesRepository.listActiveByPassenger(tx, passengerId);

    return toPassengerViews(tx, rides);
  });
}

export function getRide(passengerId, rideId) {
  return ridesRepository.inTransaction(async (tx) => {
    await expireStaleRide(tx, passengerId);

    // Filtering by passengerId too: someone else's ride is "not found", never "forbidden",
    // so we don't reveal that it exists (rules.md B9)
    const ride = await ridesRepository.findByIdForPassenger(tx, rideId, passengerId);
    if (!ride) throw new AppError('RIDE_NOT_FOUND', 404, 'Ride not found');

    const [view] = await toPassengerViews(tx, [ride]);
    return view;
  });
}

function rideChanged() {
  return new AppError('RIDE_CHANGED', 409, 'This ride was just updated, please refresh and try again');
}

// Passenger cancels their own ride (rules.md B7). Allowed from REQUESTED, MATCHED and DRIVER_ARRIVED;
// from STARTED on, the transition table refuses it with 409 INVALID_TRANSITION.
export function cancelRide(passengerId, rideId) {
  return ridesRepository.inTransaction(async (tx) => {
    // 1. Look at the ride (only yours: someone else's is 404) to learn which pool it is in
    const first = await ridesRepository.findByIdForPassenger(tx, rideId, passengerId);
    if (!first) throw new AppError('RIDE_NOT_FOUND', 404, 'Ride not found');

    // 2. Lock the pool BEFORE touching the request (lock order: pool, then request)
    const pool = first.poolId ? await poolsService.lockPool(tx, first.poolId) : null;

    // 3. Read again under the lock: the driver may have acted while we waited for it
    const ride = await ridesRepository.findByIdForPassenger(tx, rideId, passengerId);
    if (!ride || ride.poolId !== first.poolId) throw rideChanged();

    // 4. Is cancelling allowed from this status?
    assertRequestTransition(ride.status, 'CANCELLED');

    // 5. Cancel, but only if the status is still what we just read
    const cancelled = await ridesRepository.cancelRequest(tx, {
      id: ride.id,
      fromStatus: ride.status,
      cancelledBy: passengerId,
      reason: 'PASSENGER',
    });
    if (!cancelled) throw rideChanged();

    await ridesRepository.createEvent(tx, {
      rideRequestId: ride.id,
      poolId: ride.poolId,
      fromStatus: ride.status,
      toStatus: 'CANCELLED',
      actorUserId: passengerId,
      reason: 'PASSENGER',
    });

    // 6. Free the seats (and cancel the pool if this was its last passenger)
    if (pool) await poolsService.removeMember(tx, pool, ride.seats, passengerId);

    const updated = await ridesRepository.findByIdForPassenger(tx, rideId, passengerId);
    return toPassengerView(updated, 0);
  });
}
