import { AppError } from '../../lib/AppError.js';
import { assertPoolTransition, assertRequestTransition } from '../../domain/transitions.js';
import { canJoin } from '../../domain/matching.js';
import { createEvent, attachToPool } from '../rides/rides.repository.js';
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
