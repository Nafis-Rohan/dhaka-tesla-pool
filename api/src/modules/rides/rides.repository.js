import { prisma } from '../../lib/prisma.js';

// Every function takes `db`: either the normal client or the `tx` handed out by inTransaction,
// so the service decides which queries share one transaction.
export function inTransaction(work) {
  return prisma.$transaction(work);
}

const withZones = { pickupZone: true, destZone: true };

export function createRequest(db, data) {
  return db.rideRequest.create({ data, include: withZones });
}

// Expires the passenger's own REQUESTED ride if it has waited past the cutoff.
// Returns its id, or null if there was nothing to expire.
export async function expireStaleRequest(db, passengerId, cutoff) {
  const stale = await db.rideRequest.findFirst({
    where: { passengerId, status: 'REQUESTED', requestedAt: { lt: cutoff } },
    select: { id: true },
  });
  if (!stale) return null;

  // Conditional update: only if it is STILL requested (a driver may have matched it a moment ago)
  const { count } = await db.rideRequest.updateMany({
    where: { id: stale.id, status: 'REQUESTED' },
    data: { status: 'EXPIRED' },
  });
  return count === 1 ? stale.id : null;
}

// The statuses the database's "one active ride per passenger" index treats as active
export const ACTIVE_STATUSES = ['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED'];
export const FINISHED_STATUSES = ['COMPLETED', 'CANCELLED', 'EXPIRED'];
// Requests that count as riding in a pool (cancelled and expired ones are not co-passengers)
export const POOL_MEMBER_STATUSES = ['MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED'];

const HISTORY_LIMIT = 50; // simple cap instead of pagination (documented limitation)

export function listActiveByPassenger(db, passengerId) {
  return db.rideRequest.findMany({
    where: { passengerId, status: { in: ACTIVE_STATUSES } },
    include: withZones,
    orderBy: { createdAt: 'desc' },
  });
}

export function listHistoryByPassenger(db, passengerId) {
  return db.rideRequest.findMany({
    where: { passengerId, status: { in: FINISHED_STATUSES } },
    include: withZones,
    orderBy: { createdAt: 'desc' }, // served by the (passenger_id, created_at DESC) index
    take: HISTORY_LIMIT,
  });
}

// Matching on passengerId as well means someone else's ride simply isn't found (404, never 403)
export function findByIdForPassenger(db, id, passengerId) {
  return db.rideRequest.findFirst({ where: { id, passengerId }, include: withZones });
}

// How many riding requests each pool holds, in ONE query. Returns Map(poolId -> count).
// The caller subtracts the passenger's own ride to get "other passengers".
export async function countMembersByPool(db, poolIds) {
  if (poolIds.length === 0) return new Map();

  const rows = await db.rideRequest.groupBy({
    by: ['poolId'],
    where: { poolId: { in: poolIds }, status: { in: POOL_MEMBER_STATUSES } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.poolId, row._count._all]));
}

// Any request by id, for a driver looking at a waiting ride. Passenger screens use
// findByIdForPassenger instead, which only ever returns the passenger's own ride.
export function findById(db, id) {
  return db.rideRequest.findUnique({ where: { id }, include: withZones });
}

// A request that is in THIS pool. A request from someone else's pool is simply "not found".
export function findInPool(db, id, poolId) {
  return db.rideRequest.findFirst({ where: { id, poolId }, include: withZones });
}

// Everyone in a pool with the passenger's name, for the driver's screens
export function listInPool(db, poolId) {
  return db.rideRequest.findMany({
    where: { poolId },
    include: { ...withZones, passenger: { select: { id: true, name: true } } },
    orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
  });
}

export function countInPool(db, poolId, status) {
  return db.rideRequest.count({ where: { poolId, status } });
}

export function updateRequest(db, id, data) {
  return db.rideRequest.update({ where: { id }, data });
}

// Moves every request in the pool that is in one of `fromStatuses` in a single statement
export function updateManyInPool(db, poolId, fromStatuses, data) {
  return db.rideRequest.updateMany({
    where: { poolId, status: { in: fromStatuses } },
    data,
  });
}

// REQUESTED -> MATCHED and pool membership in one conditional update. Returns false if the
// request is no longer REQUESTED (e.g. someone else already matched or cancelled it).
export async function attachToPool(db, { id, poolId }) {
  const { count } = await db.rideRequest.updateMany({
    where: { id, status: 'REQUESTED' },
    data: { status: 'MATCHED', poolId },
  });
  return count === 1;
}

// Cancels only if the ride is STILL in the status the caller just read. If it changed in the
// meantime (e.g. a driver matched it), nothing is updated and we return false so the caller can 409.
// pool_id is cleared: pool membership is ride_requests.pool_id, so a cancelled request leaves the
// pool (the events table keeps which pool it was in). `reason` is PASSENGER or NO_SHOW.
export async function cancelRequest(db, { id, fromStatus, cancelledBy, reason }) {
  const { count } = await db.rideRequest.updateMany({
    where: { id, status: fromStatus },
    data: { status: 'CANCELLED', cancelReason: reason, cancelledBy, poolId: null },
  });
  return count === 1;
}

// Append-only audit trail: one row per status change (the "explain what happened" requirement)
export function createEvent(db, { rideRequestId = null, poolId = null, fromStatus, toStatus, actorUserId = null, reason = null }) {
  return db.rideEvent.create({
    data: { rideRequestId, poolId, fromStatus, toStatus, actorUserId, reason },
  });
}
