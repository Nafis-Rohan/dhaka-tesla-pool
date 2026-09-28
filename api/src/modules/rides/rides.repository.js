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

// Append-only audit trail: one row per status change (the "explain what happened" requirement)
export function createEvent(db, { rideRequestId = null, poolId = null, fromStatus, toStatus, actorUserId = null, reason = null }) {
  return db.rideEvent.create({
    data: { rideRequestId, poolId, fromStatus, toStatus, actorUserId, reason },
  });
}
