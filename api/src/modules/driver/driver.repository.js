import { prisma } from '../../lib/prisma.js';
import { findActivePoolByVehicle } from '../pools/pools.repository.js';

// Every function takes `db`: the normal client or the `tx` of a running transaction.
export function inTransaction(work) {
  return prisma.$transaction(work);
}

// One vehicle per driver (UNIQUE(driver_id)), so the driver's id is enough to find it
export function findVehicleByDriver(db, driverId) {
  return db.vehicle.findUnique({ where: { driverId }, include: { currentZone: true } });
}

// Lock order for the driver flow is ALWAYS vehicle, then pool, then request rows.
// Going offline and accepting a ride both take this lock first, so they can't interleave:
// a driver can't slip offline while a request is being accepted onto their Tesla.
export function lockVehicle(db, vehicleId) {
  return db.$queryRaw`SELECT id FROM vehicles WHERE id = ${vehicleId}::uuid FOR UPDATE`;
}

export async function hasActivePool(db, vehicleId) {
  return Boolean(await findActivePoolByVehicle(db, vehicleId));
}

const FEED_LIMIT = 20;

// Waiting requests in one pickup zone, oldest first. `cutoff` hides requests older than 10 minutes
// (they are about to expire). Served by the (status, pickup_zone_id) index.
export function listWaitingRequests(db, { zoneId, cutoff }) {
  return db.rideRequest.findMany({
    where: { status: 'REQUESTED', pickupZoneId: zoneId, requestedAt: { gte: cutoff } },
    include: { pickupZone: true, destZone: true },
    orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
    take: FEED_LIMIT,
  });
}

export function updateAvailability(db, vehicleId, { isOnline, currentZoneId }) {
  return db.vehicle.update({
    where: { id: vehicleId },
    data: { isOnline, currentZoneId },
    include: { currentZone: true },
  });
}
