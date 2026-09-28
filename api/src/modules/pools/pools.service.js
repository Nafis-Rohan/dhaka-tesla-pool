import { AppError } from '../../lib/AppError.js';
import { assertPoolTransition } from '../../domain/transitions.js';
import { createEvent } from '../rides/rides.repository.js';
import * as poolsRepository from './pools.repository.js';

// Locks the pool for the rest of the transaction and returns its fresh state.
// Lock order is ALWAYS pool first, then request rows: two transactions that take
// locks in the same order can wait on each other but never deadlock (rules.md B8).
export async function lockPool(tx, poolId) {
  const pool = await poolsRepository.lockPool(tx, poolId);
  if (!pool) throw new AppError('POOL_NOT_FOUND', 404, 'Pool not found');
  return pool;
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
