import { describe, it, expect } from 'vitest';
import { canJoin, buildAdjacency } from './matching.js';

// Zone names double as ids here: the rule only compares them, it doesn't care about the format.
// Same neighbour list as the seed (rules.md B2).
const adjacency = buildAdjacency([
  ['Banani', 'Gulshan 1'],
  ['Banani', 'Gulshan 2'],
  ['Banani', 'Mohakhali'],
  ['Gulshan 1', 'Gulshan 2'],
  ['Gulshan 1', 'Mohakhali'],
  ['Gulshan 2', 'Bashundhara'],
  ['Bashundhara', 'Uttara'],
  ['Mohakhali', 'Farmgate'],
  ['Farmgate', 'Dhanmondi'],
  ['Farmgate', 'Mirpur'],
]);

// Bullet after Jashim accepted Nusrat: 1 of 3 seats taken, still open for joining
const bulletWithNusrat = {
  status: 'MATCHED',
  isShared: true,
  pickupZoneId: 'Banani',
  capacity: 3,
  seatsTaken: 1,
};
const nusrat = { destZoneId: 'Mohakhali' };

const rafiqRequest = { pickupZoneId: 'Banani', destZoneId: 'Gulshan 1', seats: 1, allowPool: true };

const check = (pool, members, request) => canJoin(pool, members, request, adjacency);

describe('canJoin: the story', () => {
  it('lets Rafiq (Banani -> Gulshan 1) join Nusrat (Banani -> Mohakhali): same pickup, adjacent destinations', () => {
    expect(check(bulletWithNusrat, [nusrat], rafiqRequest)).toEqual({ ok: true });
  });

  it('is symmetric: Nusrat can also join a pool that Rafiq started', () => {
    const bulletWithRafiq = { ...bulletWithNusrat };
    const rafiq = { destZoneId: 'Gulshan 1' };
    const nusratRequest = { pickupZoneId: 'Banani', destZoneId: 'Mohakhali', seats: 1, allowPool: true };

    expect(check(bulletWithRafiq, [rafiq], nusratRequest)).toEqual({ ok: true });
  });

  it('lets a passenger with the same destination join', () => {
    const sameDestination = { ...rafiqRequest, destZoneId: 'Mohakhali' };

    expect(check(bulletWithNusrat, [nusrat], sameDestination).ok).toBe(true);
  });
});

describe('canJoin: route compatibility', () => {
  it('rejects a destination that is not adjacent (Banani -> Uttara vs Mohakhali)', () => {
    const uttara = { ...rafiqRequest, destZoneId: 'Uttara' };

    expect(check(bulletWithNusrat, [nusrat], uttara)).toEqual({
      ok: false,
      reason: 'DESTINATION_INCOMPATIBLE',
    });
  });

  it('checks EVERY member, not just the first: Farmgate fits Mohakhali but not Gulshan 1', () => {
    const pool = { ...bulletWithNusrat, seatsTaken: 2 };
    const members = [{ destZoneId: 'Mohakhali' }, { destZoneId: 'Gulshan 1' }];
    const farmgate = { ...rafiqRequest, destZoneId: 'Farmgate' };

    expect(check(pool, members, farmgate).reason).toBe('DESTINATION_INCOMPATIBLE');
  });

  it('rejects a different pickup zone', () => {
    const fromGulshan = { ...rafiqRequest, pickupZoneId: 'Gulshan 1', destZoneId: 'Mohakhali' };

    expect(check(bulletWithNusrat, [nusrat], fromGulshan).reason).toBe('PICKUP_MISMATCH');
  });
});

describe("canJoin: Bullet's capacity", () => {
  it("accepts a request that fills Bullet's last seat exactly", () => {
    const pool = { ...bulletWithNusrat, seatsTaken: 2 };

    expect(check(pool, [nusrat], rafiqRequest).ok).toBe(true);
  });

  it('rejects when the pool is full (3 of 3 seats)', () => {
    const pool = { ...bulletWithNusrat, seatsTaken: 3 };

    expect(check(pool, [nusrat], rafiqRequest).reason).toBe('POOL_FULL');
  });

  it('rejects a 2-seat request when only 1 seat is left', () => {
    const pool = { ...bulletWithNusrat, seatsTaken: 2 };
    const twoSeats = { ...rafiqRequest, seats: 2 };

    expect(check(pool, [nusrat], twoSeats).reason).toBe('POOL_FULL');
  });
});

describe('canJoin: pool state and consent', () => {
  it.each(['DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED'])(
    'rejects joining a pool that is %s (only MATCHED pools are open)',
    (status) => {
      const pool = { ...bulletWithNusrat, status };

      expect(check(pool, [nusrat], rafiqRequest).reason).toBe('POOL_NOT_OPEN');
    },
  );

  it('never adds strangers to a solo-ride pool', () => {
    const solo = { ...bulletWithNusrat, isShared: false };

    expect(check(solo, [nusrat], rafiqRequest).reason).toBe('POOL_NOT_SHARED');
  });

  it('never adds a passenger who turned off "OK to share"', () => {
    const optedOut = { ...rafiqRequest, allowPool: false };

    expect(check(bulletWithNusrat, [nusrat], optedOut).reason).toBe('PASSENGER_OPTED_OUT');
  });
});
