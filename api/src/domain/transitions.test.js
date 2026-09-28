import { describe, it, expect } from 'vitest';
import {
  REQUEST_STATUS,
  POOL_STATUS,
  assertRequestTransition,
  assertPoolTransition,
} from './transitions.js';
import { AppError } from '../lib/AppError.js';

// The allowed moves, written out by hand from docs/lifecycle.md. They are NOT read from the
// table in transitions.js, so a typo in the table can't hide behind a test that copies it.
const ALLOWED_REQUEST = [
  ['REQUESTED', 'MATCHED'],
  ['REQUESTED', 'CANCELLED'],
  ['REQUESTED', 'EXPIRED'],
  ['MATCHED', 'DRIVER_ARRIVED'],
  ['MATCHED', 'CANCELLED'],
  ['MATCHED', 'REQUESTED'], // driver cancelled the pool: passenger is re-queued
  ['DRIVER_ARRIVED', 'STARTED'],
  ['DRIVER_ARRIVED', 'CANCELLED'], // passenger cancels, or driver marks no-show
  ['DRIVER_ARRIVED', 'REQUESTED'], // driver cancelled the pool
  ['STARTED', 'COMPLETED'],
];

const ALLOWED_POOL = [
  ['MATCHED', 'DRIVER_ARRIVED'],
  ['MATCHED', 'CANCELLED'],
  ['DRIVER_ARRIVED', 'STARTED'],
  ['DRIVER_ARRIVED', 'CANCELLED'],
  ['STARTED', 'COMPLETED'],
];

// Every (from, to) pair, split into the allowed ones and everything else
function splitPairs(statuses, allowed) {
  const isAllowed = (from, to) => allowed.some(([f, t]) => f === from && t === to);
  const all = statuses.flatMap((from) => statuses.map((to) => [from, to]));
  return {
    legal: all.filter(([from, to]) => isAllowed(from, to)),
    illegal: all.filter(([from, to]) => !isAllowed(from, to)),
  };
}

const request = splitPairs(Object.values(REQUEST_STATUS), ALLOWED_REQUEST);
const pool = splitPairs(Object.values(POOL_STATUS), ALLOWED_POOL);

describe('request transitions', () => {
  it.each(request.legal)('allows %s -> %s', (from, to) => {
    expect(() => assertRequestTransition(from, to)).not.toThrow();
  });

  it.each(request.illegal)('rejects %s -> %s with 409 INVALID_TRANSITION', (from, to) => {
    expect.assertions(3);
    try {
      assertRequestTransition(from, to);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.status).toBe(409);
      expect(err.code).toBe('INVALID_TRANSITION');
    }
  });
});

describe('pool transitions', () => {
  it.each(pool.legal)('allows %s -> %s', (from, to) => {
    expect(() => assertPoolTransition(from, to)).not.toThrow();
  });

  it.each(pool.illegal)('rejects %s -> %s with 409 INVALID_TRANSITION', (from, to) => {
    expect.assertions(3);
    try {
      assertPoolTransition(from, to);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.status).toBe(409);
      expect(err.code).toBe('INVALID_TRANSITION');
    }
  });
});

describe('the rules that matter most', () => {
  it("a passenger can't cancel once the ride has STARTED (cancellation rule)", () => {
    expect(() => assertRequestTransition('STARTED', 'CANCELLED')).toThrow(AppError);
  });

  it("a passenger can't be re-queued mid-ride: only before the trip starts", () => {
    expect(() => assertRequestTransition('STARTED', 'REQUESTED')).toThrow(AppError);
  });

  it('cannot skip a step: a request goes MATCHED -> DRIVER_ARRIVED -> STARTED, never MATCHED -> STARTED', () => {
    expect(() => assertRequestTransition('MATCHED', 'STARTED')).toThrow(AppError);
    expect(() => assertPoolTransition('MATCHED', 'STARTED')).toThrow(AppError);
  });

  it.each(['COMPLETED', 'CANCELLED', 'EXPIRED'])('%s is final: nothing can follow it', (final) => {
    for (const to of Object.values(REQUEST_STATUS)) {
      expect(() => assertRequestTransition(final, to)).toThrow(AppError);
    }
  });

  it('rejects an unknown status instead of allowing it', () => {
    expect(() => assertRequestTransition('TELEPORTED', 'COMPLETED')).toThrow(AppError);
    expect(() => assertPoolTransition('MATCHED', 'TELEPORTED')).toThrow(AppError);
  });

  it('says what was attempted, so the client and the logs can explain the failure', () => {
    expect.assertions(2);
    try {
      assertRequestTransition('STARTED', 'CANCELLED');
    } catch (err) {
      expect(err.message).toBe('A ride request cannot move from STARTED to CANCELLED');
      expect(err.details).toEqual({ from: 'STARTED', to: 'CANCELLED' });
    }
  });
});
