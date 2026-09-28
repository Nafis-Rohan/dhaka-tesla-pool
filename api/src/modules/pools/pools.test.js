import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { pool as pgPool } from '../../lib/db.js';
import {
  CAST,
  createCast,
  removeCast,
  resetRides,
  seedZones,
  loginToken,
  createBullet,
  createPool,
  insertRide,
} from '../../test/helpers.js';

let cast; // users by key: { jashim, nusrat, rafiq, shirin }
let zone; // { 'Banani': id, ... }
let token;

beforeAll(async () => {
  cast = await createCast();
  zone = await seedZones();
  token = {
    nusrat: await loginToken(CAST.nusrat),
    rafiq: await loginToken(CAST.rafiq),
    shirin: await loginToken(CAST.shirin),
  };
});

// Every test starts with no rides, pools or vehicles (the cast and zones stay)
beforeEach(resetRides);

afterAll(async () => {
  await removeCast();
  await prisma.$disconnect();
  await pgPool.end();
});

// --- helpers ---------------------------------------------------------------------------------

const as = (who) => ({ Authorization: `Bearer ${token[who]}` });

const book = (who, overrides = {}) =>
  request(app)
    .post('/rides')
    .set(as(who))
    .send({ pickupZoneId: zone['Banani'], destZoneId: zone['Mohakhali'], seats: 1, ...overrides });

// Bullet with an open trip from Banani. `members` are requests already riding in it:
// [{ who, seats, destZoneId? }]. seatsTaken is derived from them so the two always agree.
async function openBullet(members, poolOverrides = {}) {
  const bullet = await createBullet(cast.jashim.id);
  const seatsTaken = members.reduce((sum, member) => sum + member.seats, 0);
  const trip = await createPool({
    vehicleId: bullet.id,
    pickupZoneId: zone['Banani'],
    seatsTaken,
    ...poolOverrides,
  });

  const rides = {};
  for (const { who, seats, destZoneId = zone['Mohakhali'] } of members) {
    rides[who] = await insertRide({
      passengerId: cast[who].id,
      pickupZoneId: zone['Banani'],
      destZoneId,
      seats,
      poolId: trip.id,
      status: 'MATCHED',
    });
  }
  return { trip, rides };
}

const reloadPool = (id) => prisma.pool.findUnique({ where: { id } });
const membersOf = (poolId) => prisma.rideRequest.count({ where: { poolId } });

// --- joining an open Bullet ------------------------------------------------------------------

describe('auto-join: the story', () => {
  it('puts Rafiq (Banani -> Gulshan 1) into the Bullet Nusrat is already in', async () => {
    // Jashim accepted Nusrat, so Bullet holds 1 of 3 seats
    const { trip, rides } = await openBullet([{ who: 'nusrat', seats: 1 }]);

    const res = await book('rafiq', { destZoneId: zone['Gulshan 1'] });

    expect(res.status).toBe(201);
    expect(res.body.ride).toMatchObject({
      status: 'MATCHED',
      coPassengerCount: 1,
      expiresAt: null,
      // his own price, not Nusrat's: 3000 m -> 9000 solo, 7200 pooled
      fare: { estimatedSolo: 9000, estimatedPooled: 7200 },
    });
    expect((await reloadPool(trip.id)).seatsTaken).toBe(2);

    // and Nusrat now sees that she shares, without learning who with
    const nusrat = await request(app).get(`/rides/${rides.nusrat.id}`).set(as('nusrat'));
    expect(nusrat.body.ride.coPassengerCount).toBe(1);
  });

  it('records the join in the audit trail with the reason AUTO_JOIN', async () => {
    const { trip } = await openBullet([{ who: 'nusrat', seats: 1 }]);

    const res = await book('rafiq', { destZoneId: zone['Gulshan 1'] });

    const events = await prisma.rideEvent.findMany({ where: { rideRequestId: res.body.ride.id } });
    expect(events).toContainEqual(
      expect.objectContaining({
        fromStatus: 'REQUESTED',
        toStatus: 'MATCHED',
        poolId: trip.id,
        actorUserId: cast.rafiq.id,
        reason: 'AUTO_JOIN',
      }),
    );
  });

  it('fills all three of Bullet\'s seats with Nusrat, Rafiq and Shirin, and no more', async () => {
    const { trip } = await openBullet([{ who: 'nusrat', seats: 1 }]);

    const rafiq = await book('rafiq', { destZoneId: zone['Gulshan 1'] });
    const shirin = await book('shirin');

    expect(rafiq.body.ride.status).toBe('MATCHED');
    expect(shirin.body.ride.status).toBe('MATCHED');
    expect(shirin.body.ride.coPassengerCount).toBe(2);
    expect(await reloadPool(trip.id)).toMatchObject({ seatsTaken: 3, capacity: 3 });
    expect(await membersOf(trip.id)).toBe(3);
  });
});

describe('auto-join: when the ride must stay REQUESTED', () => {
  // In every case Nusrat is in Bullet and Rafiq books. He must NOT be added,
  // must not be treated as an error, and Bullet must be left exactly as it was.
  it.each([
    ['his destination is not next to Nusrat\'s (Uttara)', {}, { destZoneId: 'Uttara' }],
    ['he turned off "OK to share"', {}, { allowPool: false }],
    ['he is picked up somewhere else (Gulshan 1)', {}, { pickupZoneId: 'Gulshan 1' }],
    ['the driver has already arrived (pool sealed)', { status: 'DRIVER_ARRIVED' }, {}],
    ['the pool is a solo ride', { isShared: false }, {}],
  ])('when %s', async (_reason, poolOverrides, bookOverrides) => {
    const { trip } = await openBullet([{ who: 'nusrat', seats: 1 }], poolOverrides);
    const overrides = { ...bookOverrides };
    // the table names zones; turn them into ids
    for (const key of ['destZoneId', 'pickupZoneId']) {
      if (overrides[key]) overrides[key] = zone[overrides[key]];
    }

    const res = await book('rafiq', overrides);

    expect(res.status).toBe(201);
    expect(res.body.ride).toMatchObject({ status: 'REQUESTED', coPassengerCount: 0 });
    expect((await reloadPool(trip.id)).seatsTaken).toBe(1);
    expect(await membersOf(trip.id)).toBe(1);
  });
});

describe("Bullet's capacity can never be exceeded", () => {
  it('does not add a fourth seat to a full Bullet', async () => {
    const { trip } = await openBullet([
      { who: 'nusrat', seats: 2 },
      { who: 'shirin', seats: 1 },
    ]);

    const res = await book('rafiq', { destZoneId: zone['Gulshan 1'] });

    expect(res.body.ride.status).toBe('REQUESTED');
    expect((await reloadPool(trip.id)).seatsTaken).toBe(3);
  });

  it('does not squeeze a 2-seat booking into the 1 seat left, but takes a 1-seat booking', async () => {
    const { trip } = await openBullet([{ who: 'nusrat', seats: 2 }]);

    const tooBig = await book('rafiq', { destZoneId: zone['Gulshan 1'], seats: 2 });
    expect(tooBig.body.ride.status).toBe('REQUESTED');
    expect((await reloadPool(trip.id)).seatsTaken).toBe(2);

    // Rafiq is now waiting, so he cancels; Shirin's single seat then fits exactly
    await request(app).post(`/rides/${tooBig.body.ride.id}/cancel`).set(as('rafiq'));
    const fits = await book('shirin');

    expect(fits.body.ride.status).toBe('MATCHED');
    expect((await reloadPool(trip.id)).seatsTaken).toBe(3);
  });

  it('is enforced by the database itself, even against buggy code', async () => {
    const { trip } = await openBullet([{ who: 'nusrat', seats: 3 }]);

    // a bug that tried to seat a fourth passenger would be refused by CHECK (seats_taken <= capacity)
    await expect(
      prisma.pool.update({ where: { id: trip.id }, data: { seatsTaken: { increment: 1 } } }),
    ).rejects.toThrow();
    expect((await reloadPool(trip.id)).seatsTaken).toBe(3);
  });
});

// --- the race from the brief -----------------------------------------------------------------

describe('the last seat: Nusrat and Shirin request at the same instant', () => {
  it('gives it to exactly one of them, every time', async () => {
    // Repeated because a race that passes once proves little
    for (let round = 1; round <= 5; round++) {
      await resetRides();
      // Rafiq holds 2 of Bullet's 3 seats, so both newcomers first see "1 seat available"
      const { trip } = await openBullet([{ who: 'rafiq', seats: 2, destZoneId: zone['Gulshan 1'] }]);

      const [nusrat, shirin] = await Promise.all([book('nusrat'), book('shirin')]);

      // neither request errors: the loser just keeps waiting for another driver
      expect(nusrat.status).toBe(201);
      expect(shirin.status).toBe(201);
      expect([nusrat.body.ride.status, shirin.body.ride.status].sort()).toEqual(['MATCHED', 'REQUESTED']);

      // Bullet is exactly full and holds exactly Rafiq + the winner
      expect((await reloadPool(trip.id)).seatsTaken).toBe(3);
      expect(await membersOf(trip.id)).toBe(2);
    }
  });

  it('gives both a seat when two are free (the lock must not turn people away needlessly)', async () => {
    const { trip } = await openBullet([{ who: 'rafiq', seats: 1, destZoneId: zone['Gulshan 1'] }]);

    const [nusrat, shirin] = await Promise.all([book('nusrat'), book('shirin')]);

    expect(nusrat.body.ride.status).toBe('MATCHED');
    expect(shirin.body.ride.status).toBe('MATCHED');
    expect((await reloadPool(trip.id)).seatsTaken).toBe(3);
    expect(await membersOf(trip.id)).toBe(3);
  });
});
