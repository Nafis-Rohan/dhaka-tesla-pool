import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
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

let cast; // users by key: { jashim, nusrat, rafiq, shirin, kamal }
let zone; // { 'Banani': id, ... }
let token;

beforeAll(async () => {
  cast = await createCast();
  zone = await seedZones();
  token = {
    nusrat: await loginToken(CAST.nusrat),
    rafiq: await loginToken(CAST.rafiq),
    shirin: await loginToken(CAST.shirin),
    jashim: await loginToken(CAST.jashim),
    kamal: await loginToken(CAST.kamal),
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

const goOnline = (who, zoneName = 'Banani') =>
  request(app).put('/driver/availability').set(as(who)).send({ online: true, zoneId: zone[zoneName] });
const goOffline = (who) => request(app).put('/driver/availability').set(as(who)).send({ online: false });
const availability = (who) => request(app).get('/driver/availability').set(as(who));
const feed = (who) => request(app).get('/driver/requests').set(as(who));
const accept = (who, rideId) => request(app).post(`/driver/requests/${rideId}/accept`).set(as(who));
const history = (who) => request(app).get('/driver/history').set(as(who));
const getRide = (who, rideId) => request(app).get(`/rides/${rideId}`).set(as(who));

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000);

// A passenger's request that is waiting for a driver (defaults to Nusrat's trip)
const waiting = (who, overrides = {}) =>
  insertRide({
    passengerId: cast[who].id,
    pickupZoneId: zone['Banani'],
    destZoneId: zone['Mohakhali'],
    ...overrides,
  });

const jashimsBullet = () => createBullet(cast.jashim.id);
const kamalsRocket = () => createBullet(cast.kamal.id, { name: 'Rocket', plate: 'DHAKA-TESLA-2' });

// Bullet with an open trip from Banani that already holds Nusrat
async function bulletWithNusrat(poolOverrides = {}, nusratOverrides = {}) {
  const bullet = await jashimsBullet();
  const trip = await createPool({
    vehicleId: bullet.id,
    pickupZoneId: zone['Banani'],
    seatsTaken: nusratOverrides.seats ?? 1,
    ...poolOverrides,
  });
  const nusrat = await waiting('nusrat', { poolId: trip.id, status: 'MATCHED', ...nusratOverrides });
  return { bullet, trip, nusrat };
}

const reload = {
  ride: (id) => prisma.rideRequest.findUnique({ where: { id } }),
  pool: (id) => prisma.pool.findUnique({ where: { id } }),
  events: (where) => prisma.rideEvent.findMany({ where }),
};

// --- availability ----------------------------------------------------------------------------

describe('PUT /driver/availability', () => {
  it('puts Jashim and Bullet online in Banani', async () => {
    await jashimsBullet();

    const res = await goOnline('jashim');

    expect(res.status).toBe(200);
    expect(res.body.availability).toMatchObject({
      isOnline: true,
      currentZone: { name: 'Banani' },
      vehicle: { name: 'Bullet', capacity: 3 },
    });
  });

  it('takes him offline again and forgets the zone', async () => {
    await jashimsBullet();
    await goOnline('jashim');

    const res = await goOffline('jashim');

    expect(res.status).toBe(200);
    expect(res.body.availability).toMatchObject({ isOnline: false, currentZone: null });
  });

  it('needs a zone to go online', async () => {
    await jashimsBullet();

    const res = await request(app).put('/driver/availability').set(as('jashim')).send({ online: true });

    expect(res.status).toBe(400);
    expect(res.body.error.details.fields).toHaveProperty('zoneId');
  });

  it('rejects an unknown zone with 404 and stays offline', async () => {
    await jashimsBullet();

    const res = await request(app)
      .put('/driver/availability')
      .set(as('jashim'))
      .send({ online: true, zoneId: randomUUID() });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ZONE_NOT_FOUND');
    expect((await availability('jashim')).body.availability.isOnline).toBe(false);
  });

  it("won't go offline in the middle of a trip", async () => {
    await bulletWithNusrat();
    await goOnline('jashim');

    const res = await goOffline('jashim');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACTIVE_POOL_EXISTS');
    expect((await availability('jashim')).body.availability.isOnline).toBe(true);
  });

  it('can be read back with GET', async () => {
    await jashimsBullet();
    await goOnline('jashim', 'Gulshan 1');

    const res = await availability('jashim');

    expect(res.body.availability).toMatchObject({ isOnline: true, currentZone: { name: 'Gulshan 1' } });
  });

  it('gives a driver with no vehicle a 404 (Kamal has not been given a Tesla yet)', async () => {
    const res = await availability('kamal');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('VEHICLE_NOT_FOUND');
  });

  it('is for drivers only: a passenger gets 403, no token gets 401', async () => {
    expect((await availability('nusrat')).status).toBe(403);
    expect((await request(app).get('/driver/availability')).status).toBe(401);
  });
});

// --- the feed --------------------------------------------------------------------------------

describe('GET /driver/requests', () => {
  it('tells an offline driver to go online', async () => {
    await jashimsBullet();

    const res = await feed('jashim');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DRIVER_OFFLINE');
  });

  it("shows only rides waiting in the driver's zone, and never the passenger's name", async () => {
    await jashimsBullet();
    await goOnline('jashim');
    const nusrat = await waiting('nusrat');
    await waiting('rafiq', { pickupZoneId: zone['Gulshan 1'] }); // waiting somewhere else

    const res = await feed('jashim');

    expect(res.status).toBe(200);
    expect(res.body.seatsLeft).toBe(3);
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.requests[0]).toMatchObject({
      id: nusrat.id,
      seats: 1,
      pickup: { name: 'Banani' },
      destination: { name: 'Mohakhali' },
      fare: { estimatedSolo: 8000, estimatedPooled: 6400 },
    });
    const everything = JSON.stringify(res.body);
    expect(everything).not.toContain('Nusrat');
    expect(everything).not.toContain(CAST.nusrat.phone);
  });

  it('hides rides that have already waited past 10 minutes', async () => {
    await jashimsBullet();
    await goOnline('jashim');
    await waiting('nusrat', { requestedAt: minutesAgo(11) });

    const res = await feed('jashim');

    expect(res.body.requests).toEqual([]);
  });

  it('lists the longest-waiting ride first', async () => {
    await jashimsBullet();
    await goOnline('jashim');
    const shirin = await waiting('shirin', { requestedAt: minutesAgo(1) });
    const nusrat = await waiting('nusrat', { requestedAt: minutesAgo(5) });

    const res = await feed('jashim');

    expect(res.body.requests.map((request) => request.id)).toEqual([nusrat.id, shirin.id]);
  });

  it('with an open shared trip, offers only rides that could join it', async () => {
    await bulletWithNusrat();
    await goOnline('jashim');
    const rafiq = await waiting('rafiq', { destZoneId: zone['Gulshan 1'] }); // next to Mohakhali
    await waiting('shirin', { destZoneId: zone['Uttara'] }); // nowhere near

    const res = await feed('jashim');

    expect(res.body.seatsLeft).toBe(2);
    expect(res.body.requests.map((request) => request.id)).toEqual([rafiq.id]);
  });

  it('offers nothing once the trip has arrived: it is closed to new passengers', async () => {
    await bulletWithNusrat({ status: 'DRIVER_ARRIVED' });
    await goOnline('jashim');
    await waiting('rafiq', { destZoneId: zone['Gulshan 1'] });

    const res = await feed('jashim');

    expect(res.body.requests).toEqual([]);
  });

  it('is for drivers only', async () => {
    expect((await feed('nusrat')).status).toBe(403);
  });
});

// --- accepting a ride ------------------------------------------------------------------------

describe('POST /driver/requests/:id/accept', () => {
  it("turns Nusrat's waiting ride into Jashim's trip", async () => {
    await jashimsBullet();
    await goOnline('jashim');
    const nusrat = await waiting('nusrat');

    const res = await accept('jashim', nusrat.id);

    expect(res.status).toBe(200);
    expect(res.body.pool).toMatchObject({
      status: 'MATCHED',
      isShared: true,
      capacity: 3,
      seatsTaken: 1,
      seatsLeft: 2,
      pickupZone: { name: 'Banani' },
    });
    expect(res.body.pool.passengers).toHaveLength(1);
    expect(res.body.pool.passengers[0]).toMatchObject({
      requestId: nusrat.id,
      name: 'Nusrat',
      seats: 1,
      destination: { name: 'Mohakhali' },
      status: 'MATCHED',
    });

    const poolId = res.body.pool.id;
    expect(await reload.ride(nusrat.id)).toMatchObject({ status: 'MATCHED', poolId });

    // the audit trail says who did what
    expect(await reload.events({ rideRequestId: nusrat.id })).toContainEqual(
      expect.objectContaining({
        fromStatus: 'REQUESTED',
        toStatus: 'MATCHED',
        actorUserId: cast.jashim.id,
        reason: 'DRIVER_ACCEPT',
      }),
    );
    expect(await reload.events({ poolId, rideRequestId: null })).toContainEqual(
      expect.objectContaining({ fromStatus: 'NONE', toStatus: 'MATCHED', actorUserId: cast.jashim.id }),
    );
  });

  it('shows Nusrat that she has been matched', async () => {
    await jashimsBullet();
    await goOnline('jashim');
    const nusrat = await waiting('nusrat');

    await accept('jashim', nusrat.id);

    const res = await getRide('nusrat', nusrat.id);
    expect(res.body.ride).toMatchObject({ status: 'MATCHED', coPassengerCount: 0 });
  });

  it('adds a second compatible ride to the same trip', async () => {
    await jashimsBullet();
    await goOnline('jashim');
    const nusrat = await waiting('nusrat');
    await accept('jashim', nusrat.id);
    const rafiq = await waiting('rafiq', { destZoneId: zone['Gulshan 1'], distanceCharge: 6000 });

    const res = await accept('jashim', rafiq.id);

    expect(res.status).toBe(200);
    expect(res.body.pool.seatsTaken).toBe(2);
    expect(res.body.pool.passengers.map((passenger) => passenger.name).sort()).toEqual(['Nusrat', 'Rafiq']);
    expect(await prisma.pool.count()).toBe(1); // extended, not a second pool
  });

  it('gives a passenger who wants a private ride a trip that takes no strangers', async () => {
    await jashimsBullet();
    await goOnline('jashim');
    const nusrat = await waiting('nusrat', { allowPool: false });

    const res = await accept('jashim', nusrat.id);

    expect(res.body.pool.isShared).toBe(false);
  });

  it('refuses when the driver is offline', async () => {
    await jashimsBullet();
    const nusrat = await waiting('nusrat');

    const res = await accept('jashim', nusrat.id);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DRIVER_OFFLINE');
  });

  it("refuses a ride that is not in the driver's zone", async () => {
    await jashimsBullet();
    await goOnline('jashim', 'Gulshan 1');
    const nusrat = await waiting('nusrat'); // waiting in Banani

    const res = await accept('jashim', nusrat.id);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_IN_YOUR_ZONE');
    expect((await reload.ride(nusrat.id)).status).toBe('REQUESTED');
  });

  it.each([
    ['has already been matched', { status: 'MATCHED' }],
    ['was cancelled', { status: 'CANCELLED' }],
    ['waited past 10 minutes', { requestedAt: minutesAgo(11) }],
  ])('refuses a ride that %s', async (_why, overrides) => {
    await jashimsBullet();
    await goOnline('jashim');
    const nusrat = await waiting('nusrat', overrides);

    const res = await accept('jashim', nusrat.id);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RIDE_UNAVAILABLE');
    expect(await prisma.pool.count()).toBe(0);
  });

  it('answers a ride that does not exist with 404, and a malformed id with 400', async () => {
    await jashimsBullet();
    await goOnline('jashim');

    expect((await accept('jashim', randomUUID())).status).toBe(404);
    expect((await accept('jashim', 'abc')).status).toBe(400);
  });

  it('is for drivers only: Nusrat cannot accept a ride', async () => {
    const rafiq = await waiting('rafiq');

    const res = await accept('nusrat', rafiq.id);

    expect(res.status).toBe(403);
  });
});

describe('POST /driver/requests/:id/accept: adding to a trip that is already open', () => {
  // Bullet holds Nusrat (Banani -> Mohakhali) and Rafiq is waiting. In every case the accept
  // must be refused with a reason, and neither the trip nor Rafiq's request may change.
  it.each([
    [
      'the destination is too far from Nusrat’s',
      {},
      {},
      (z) => ({ destZoneId: z['Uttara'] }),
      'DESTINATION_INCOMPATIBLE',
    ],
    ['Bullet has no seat left', {}, { seats: 3 }, () => ({}), 'POOL_FULL'],
    ['the trip is a private ride', { isShared: false }, {}, () => ({}), 'POOL_NOT_SHARED'],
    ['the trip has already arrived', { status: 'DRIVER_ARRIVED' }, {}, () => ({}), 'POOL_NOT_OPEN'],
    ['the passenger does not want to share', {}, {}, () => ({ allowPool: false }), 'PASSENGER_OPTED_OUT'],
  ])('refuses when %s', async (_why, poolOverrides, nusratOverrides, waitingOverrides, code) => {
    const { trip } = await bulletWithNusrat(poolOverrides, nusratOverrides);
    await goOnline('jashim');
    const rafiq = await waiting('rafiq', { destZoneId: zone['Gulshan 1'], ...waitingOverrides(zone) });
    const seatsBefore = (await reload.pool(trip.id)).seatsTaken;

    const res = await accept('jashim', rafiq.id);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(code);
    expect((await reload.ride(rafiq.id)).status).toBe('REQUESTED');
    expect((await reload.pool(trip.id)).seatsTaken).toBe(seatsBefore);
  });
});

describe('POST /driver/requests/:id/accept: two drivers, one ride', () => {
  it('gives the ride to exactly one of them, and the loser leaves no trace', async () => {
    await jashimsBullet();
    await kamalsRocket();
    await goOnline('jashim');
    await goOnline('kamal');
    const nusrat = await waiting('nusrat');

    const results = await Promise.all([accept('jashim', nusrat.id), accept('kamal', nusrat.id)]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    const loser = results.find((res) => res.status === 409);
    expect(loser.body.error.code).toBe('RIDE_UNAVAILABLE');

    // one ride, one trip: the loser's transaction, including the pool it began, was rolled back
    expect(await prisma.pool.count()).toBe(1);
    const saved = await reload.ride(nusrat.id);
    expect(saved.status).toBe('MATCHED');
    expect((await reload.pool(saved.poolId)).seatsTaken).toBe(1);
  });
});

// --- history ---------------------------------------------------------------------------------

describe('GET /driver/history', () => {
  it('is empty for a driver with no finished trips', async () => {
    await jashimsBullet();

    const res = await history('jashim');

    expect(res.status).toBe(200);
    expect(res.body.pools).toEqual([]);
  });

  it('lists finished trips newest first, with who rode and the cash collected', async () => {
    const bullet = await jashimsBullet();
    const done = await createPool({
      vehicleId: bullet.id,
      pickupZoneId: zone['Banani'],
      status: 'COMPLETED',
      seatsTaken: 2,
      createdAt: minutesAgo(120),
      startedAt: minutesAgo(115),
      completedAt: minutesAgo(100),
    });
    await waiting('nusrat', { poolId: done.id, status: 'COMPLETED', poolDiscount: 1600, finalFare: 6400 });
    await waiting('rafiq', {
      poolId: done.id,
      status: 'COMPLETED',
      destZoneId: zone['Gulshan 1'],
      distanceCharge: 6000,
      poolDiscount: 1800,
      finalFare: 7200,
    });
    await createPool({
      vehicleId: bullet.id,
      pickupZoneId: zone['Banani'],
      status: 'CANCELLED',
      seatsTaken: 0,
      createdAt: minutesAgo(30),
      cancelledAt: minutesAgo(29),
    });

    const res = await history('jashim');

    expect(res.body.pools.map((trip) => trip.status)).toEqual(['CANCELLED', 'COMPLETED']);
    const completed = res.body.pools[1];
    expect(completed.passengers.map((passenger) => passenger.name).sort()).toEqual(['Nusrat', 'Rafiq']);
    expect(completed.earnedFare).toBe(13600); // 6400 + 7200
  });

  it("only shows the driver's own trips", async () => {
    const bullet = await jashimsBullet();
    await createPool({ vehicleId: bullet.id, pickupZoneId: zone['Banani'], status: 'COMPLETED', seatsTaken: 0 });
    await kamalsRocket();

    expect((await history('jashim')).body.pools).toHaveLength(1);
    expect((await history('kamal')).body.pools).toHaveLength(0);
  });

  it('is for drivers only', async () => {
    expect((await history('nusrat')).status).toBe(403);
  });
});
