// Every function takes `db`: the normal client or the `tx` of a running transaction.

// Row lock: any other transaction that locks or changes this pool WAITS until we commit.
// This is what stops two people from grabbing the same seat (rules.md B8). Prisma has no
// FOR UPDATE, so this one query is raw SQL. It also returns fresh values, read under the lock.
export async function lockPool(db, poolId) {
  const rows = await db.$queryRaw`
    SELECT id, status, is_shared AS "isShared", pickup_zone_id AS "pickupZoneId",
           seats_taken AS "seatsTaken", capacity
    FROM pools
    WHERE id = ${poolId}::uuid
    FOR UPDATE`;
  return rows[0] ?? null;
}

const JOIN_CANDIDATE_LIMIT = 5;

// Pools a new request could plausibly join, oldest first. This is only a shortlist read WITHOUT
// a lock: it can be stale, so every candidate is locked and re-checked with canJoin() before joining.
// Raw SQL because Prisma can't compare two columns (seats_taken + n <= capacity).
// Ordered by (created_at, id) so every transaction visits pools in the same order (no deadlocks).
export function findJoinableCandidateIds(db, { pickupZoneId, seats }) {
  return db.$queryRaw`
    SELECT id
    FROM pools
    WHERE status = 'MATCHED'
      AND is_shared = true
      AND pickup_zone_id = ${pickupZoneId}::uuid
      AND seats_taken + ${seats} <= capacity
    ORDER BY created_at, id
    LIMIT ${JOIN_CANDIDATE_LIMIT}`;
}

// Destinations of the requests currently in the pool (cancelled requests have left it)
export function listMembers(db, poolId) {
  return db.rideRequest.findMany({ where: { poolId }, select: { destZoneId: true } });
}

// Call only while holding the pool lock and after canJoin() said yes.
// The database CHECK (seats_taken <= capacity) still backs this up.
export function addSeats(db, poolId, seats) {
  return db.pool.update({ where: { id: poolId }, data: { seatsTaken: { increment: seats } } });
}

// Guarded: never goes below zero. The database CHECK (seats_taken BETWEEN 0 AND capacity)
// is the last line of defence behind this. Returns false if the guard stopped it.
export async function releaseSeats(db, poolId, seats) {
  const { count } = await db.pool.updateMany({
    where: { id: poolId, seatsTaken: { gte: seats } },
    data: { seatsTaken: { decrement: seats } },
  });
  return count === 1;
}

export function cancelPool(db, poolId) {
  return db.pool.update({
    where: { id: poolId },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });
}
