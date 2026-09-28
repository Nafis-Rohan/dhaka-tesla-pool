// Every function takes `db`: the normal client or the `tx` of a running transaction.

// Row lock: any other transaction that locks or changes this pool WAITS until we commit.
// This is what stops two people from grabbing the same seat (rules.md B8). Prisma has no
// FOR UPDATE, so this one query is raw SQL. It also returns fresh values, read under the lock.
export async function lockPool(db, poolId) {
  const rows = await db.$queryRaw`
    SELECT id, status, seats_taken AS "seatsTaken", capacity
    FROM pools
    WHERE id = ${poolId}::uuid
    FOR UPDATE`;
  return rows[0] ?? null;
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
