import { AppError } from '../../lib/AppError.js';
import { canJoin } from '../../domain/matching.js';
import { assertRequestTransition } from '../../domain/transitions.js';
import { getAdjacency } from '../zones/zones.service.js';
import { REQUEST_EXPIRY_MS } from '../rides/rides.service.js';
import * as ridesRepository from '../rides/rides.repository.js';
import * as poolsRepository from '../pools/pools.repository.js';
import * as poolsService from '../pools/pools.service.js';
import * as driverRepository from './driver.repository.js';

const HISTORY_LIMIT = 50;

// Why a driver's accept was refused, for each reason canJoin() can give
const REFUSALS = {
  POOL_NOT_OPEN: 'Your current trip is already under way, so it cannot take more passengers',
  POOL_NOT_SHARED: 'Your current trip is a private ride',
  PASSENGER_OPTED_OUT: 'This passenger does not want to share a ride',
  PICKUP_MISMATCH: "This ride's pickup is not your trip's pickup zone",
  DESTINATION_INCOMPATIBLE: "This destination is not close enough to your passengers' destinations",
  POOL_FULL: 'There are not enough free seats for this ride',
};

function vehicleNotFound() {
  return new AppError('VEHICLE_NOT_FOUND', 404, 'No vehicle is registered to this driver');
}

function rideUnavailable() {
  return new AppError('RIDE_UNAVAILABLE', 409, 'This ride is no longer available');
}

async function findVehicle(db, driverId) {
  const vehicle = await driverRepository.findVehicleByDriver(db, driverId);
  if (!vehicle) throw vehicleNotFound();
  return vehicle;
}

// --- Availability ----------------------------------------------------------------------------

// What the driver sees about their own Tesla
function toAvailabilityView(vehicle) {
  return {
    vehicle: { id: vehicle.id, name: vehicle.name, plate: vehicle.plate, capacity: vehicle.capacity },
    isOnline: vehicle.isOnline,
    currentZone: vehicle.currentZone ? { id: vehicle.currentZone.id, name: vehicle.currentZone.name } : null,
  };
}

export async function getAvailability(driverId) {
  const vehicle = await driverRepository.inTransaction((tx) => findVehicle(tx, driverId));
  return toAvailabilityView(vehicle);
}

// Go online (in a zone) or offline. Drivers can't go offline mid-trip (rules.md B9).
export function setAvailability(driverId, { online, zoneId }) {
  return driverRepository.inTransaction(async (tx) => {
    const vehicle = await findVehicle(tx, driverId);

    // Serialise with anything else touching this Tesla (accepting a ride takes the same lock)
    await driverRepository.lockVehicle(tx, vehicle.id);

    if (!online && (await driverRepository.hasActivePool(tx, vehicle.id))) {
      throw new AppError('ACTIVE_POOL_EXISTS', 409, 'Finish or cancel your current trip before going offline');
    }

    try {
      const updated = await driverRepository.updateAvailability(tx, vehicle.id, {
        isOnline: online,
        currentZoneId: online ? zoneId : null, // offline drivers claim no location
      });
      return toAvailabilityView(updated);
    } catch (err) {
      // The foreign key on current_zone_id is the check that the zone exists (P2003 = foreign key violation)
      if (err.code === 'P2003') throw new AppError('ZONE_NOT_FOUND', 404, 'Unknown zone');
      throw err;
    }
  });
}

// --- The feed of waiting requests ------------------------------------------------------------

// Waiting rides are shown WITHOUT the passenger's name: the driver learns names only for
// passengers in their own pool (rules.md B9)
function toFeedItem(request) {
  return {
    id: request.id,
    seats: request.seats,
    allowPool: request.allowPool,
    pickup: { id: request.pickupZone.id, name: request.pickupZone.name },
    destination: { id: request.destZone.id, name: request.destZone.name },
    fare: { estimatedSolo: request.estSoloFare, estimatedPooled: request.estPooledFare },
    requestedAt: request.requestedAt,
  };
}

// Rides waiting in the driver's zone. With an open shared trip, only the ones that could actually
// join it (the same canJoin rule accepting uses), so the driver is never offered something refused.
export async function listRequests(driverId) {
  const adjacency = await getAdjacency();

  return driverRepository.inTransaction(async (tx) => {
    const vehicle = await findVehicle(tx, driverId);
    if (!vehicle.isOnline) throw new AppError('DRIVER_OFFLINE', 409, 'Go online to see ride requests');

    const active = await poolsRepository.findActivePoolByVehicle(tx, vehicle.id);
    const seatsLeft = active ? active.capacity - active.seatsTaken : vehicle.capacity;

    // A trip that has arrived or started is closed, and a private ride takes no strangers
    if (active && (active.status !== 'MATCHED' || !active.isShared)) return { seatsLeft, requests: [] };

    const waiting = await driverRepository.listWaitingRequests(tx, {
      zoneId: vehicle.currentZoneId,
      cutoff: new Date(Date.now() - REQUEST_EXPIRY_MS),
    });

    let requests = waiting;
    if (active) {
      const members = await poolsRepository.listMembers(tx, active.id);
      requests = waiting.filter((request) => canJoin(active, members, request, adjacency).ok);
    }

    return { seatsLeft, requests: requests.map(toFeedItem) };
  });
}

// --- Accepting a ride ------------------------------------------------------------------------

// Creates the driver's pool from this request, or adds it to their open shared pool (rules.md B5).
// Lock order: vehicle, then pool, then request. Two drivers accepting the same request: both
// reach the conditional update below, exactly one changes the row, and the loser's whole
// transaction (including any pool it just created) is rolled back.
export async function acceptRequest(driverId, requestId) {
  const adjacency = await getAdjacency();

  return driverRepository.inTransaction(async (tx) => {
    const found = await findVehicle(tx, driverId);
    await driverRepository.lockVehicle(tx, found.id);
    // Read again AFTER the lock: they may have gone offline a moment ago
    const vehicle = await findVehicle(tx, driverId);
    if (!vehicle.isOnline) throw new AppError('DRIVER_OFFLINE', 409, 'Go online to accept rides');

    const request = await ridesRepository.findById(tx, requestId);
    if (!request) throw new AppError('RIDE_NOT_FOUND', 404, 'Ride not found');

    const expired = request.requestedAt.getTime() < Date.now() - REQUEST_EXPIRY_MS;
    if (request.status !== 'REQUESTED' || expired) throw rideUnavailable();

    if (request.pickupZoneId !== vehicle.currentZoneId) {
      throw new AppError('NOT_IN_YOUR_ZONE', 409, 'This ride is not in your current zone');
    }

    const active = await poolsRepository.findActivePoolByVehicle(tx, vehicle.id);
    let poolId;

    if (active) {
      // Extend the open trip, if the matching rule allows it
      if (active.status !== 'MATCHED') {
        throw new AppError('POOL_NOT_OPEN', 409, REFUSALS.POOL_NOT_OPEN);
      }
      const pool = await poolsService.lockPool(tx, active.id);
      const members = await poolsRepository.listMembers(tx, pool.id);
      const verdict = canJoin(pool, members, request, adjacency);
      if (!verdict.ok) throw new AppError(verdict.reason, 409, REFUSALS[verdict.reason]);
      poolId = pool.id;
    } else {
      // Start a new trip. Capacity is copied from the vehicle so the seats CHECK works inside the row.
      if (request.seats > vehicle.capacity) throw new AppError('POOL_FULL', 409, REFUSALS.POOL_FULL);
      const created = await poolsRepository.createPool(tx, {
        vehicleId: vehicle.id,
        pickupZoneId: request.pickupZoneId,
        status: 'MATCHED',
        isShared: request.allowPool, // a passenger who wants a private ride never gets strangers
        capacity: vehicle.capacity,
        seatsTaken: request.seats,
      });
      poolId = created.id;
      await ridesRepository.createEvent(tx, {
        poolId,
        fromStatus: 'NONE',
        toStatus: 'MATCHED',
        actorUserId: driverId,
        reason: 'DRIVER_ACCEPT',
      });
    }

    assertRequestTransition('REQUESTED', 'MATCHED');
    // THE ACCEPT RACE: only succeeds while the request is still REQUESTED. If another driver got it
    // first, or the passenger just cancelled, no row changes and we roll everything back.
    const attached = await ridesRepository.attachToPool(tx, { id: request.id, poolId });
    if (!attached) throw rideUnavailable();

    if (active) await poolsRepository.addSeats(tx, poolId, request.seats);

    await ridesRepository.createEvent(tx, {
      rideRequestId: request.id,
      poolId,
      fromStatus: 'REQUESTED',
      toStatus: 'MATCHED',
      actorUserId: driverId,
      reason: 'DRIVER_ACCEPT',
    });

    return poolsService.getPoolView(tx, poolId);
  });
}

// --- History ---------------------------------------------------------------------------------

// A finished trip with who rode in it. Cancelled trips have no passengers left: they were
// re-queued or cancelled, and left the pool.
function toHistoryItem(pool) {
  const passengers = pool.requests.map((request) => ({
    name: request.passenger.name,
    seats: request.seats,
    destination: { id: request.destZone.id, name: request.destZone.name },
    status: request.status,
    fare: request.finalFare,
  }));

  return {
    id: pool.id,
    status: pool.status,
    pickupZone: { id: pool.pickupZone.id, name: pool.pickupZone.name },
    seatsTaken: pool.seatsTaken,
    startedAt: pool.startedAt,
    completedAt: pool.completedAt,
    cancelledAt: pool.cancelledAt,
    passengers,
    // Cash the driver collected: only passengers actually dropped off pay
    earnedFare: pool.requests
      .filter((request) => request.status === 'COMPLETED')
      .reduce((sum, request) => sum + (request.finalFare ?? 0), 0),
  };
}

export function getHistory(driverId) {
  return driverRepository.inTransaction(async (tx) => {
    const vehicle = await findVehicle(tx, driverId);
    const pools = await poolsRepository.listFinishedPoolsByVehicle(tx, vehicle.id, HISTORY_LIMIT);
    return pools.map(toHistoryItem);
  });
}
