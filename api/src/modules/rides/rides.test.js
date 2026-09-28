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

let cast; // users by key: { jashim, nusrat, rafiq, shirin }
let zone; // { 'Banani': id, ... }
let token; // { nusrat: jwt, ... }

const ELEVEN_MINUTES_MS = 11 * 60 * 1000; // past the 10 minute expiry

beforeAll(async () => {
  cast = await createCast();
  zone = await seedZones();
  token = {
    nusrat: await loginToken(CAST.nusrat),
    rafiq: await loginToken(CAST.rafiq),
    jashim: await loginToken(CAST.jashim),
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

const bookBody = (overrides = {}) => ({
  pickupZoneId: zone['Banani'],
  destZoneId: zone['Mohakhali'],
  seats: 1,
  ...overrides,
});

const book = (who, overrides) => request(app).post('/rides').set(as(who)).send(bookBody(overrides));
const cancel = (who, rideId) => request(app).post(`/rides/${rideId}/cancel`).set(as(who));
const fetchRide = (who, rideId) => request(app).get(`/rides/${rideId}`).set(as(who));
const listRides = (who, scope) => request(app).get(`/rides?scope=${scope}`).set(as(who));

// A request row inserted directly, defaulting to Nusrat's trip
const ride = (who, overrides = {}) =>
  insertRide({
    passengerId: cast[who].id,
    pickupZoneId: zone['Banani'],
    destZoneId: zone['Mohakhali'],
    ...overrides,
  });

// Bullet with one open trip from Banani
async function bulletTrip({ seatsTaken, status = 'MATCHED' }) {
  const bullet = await createBullet(cast.jashim.id);
  return createPool({ vehicleId: bullet.id, pickupZoneId: zone['Banani'], seatsTaken, status });
}

const reload = {
  ride: (id) => prisma.rideRequest.findUnique({ where: { id } }),
  pool: (id) => prisma.pool.findUnique({ where: { id } }),
  events: (where) => prisma.rideEvent.findMany({ where }),
};

// --- POST /rides -----------------------------------------------------------------------------

describe('POST /rides: booking', () => {
  it("books Nusrat's trip with both fare estimates and her own view of it", async () => {
    const res = await book('nusrat');

    expect(res.status).toBe(201);
    expect(res.body.ride).toMatchObject({
      status: 'REQUESTED',
      pickup: { name: 'Banani' },
      destination: { name: 'Mohakhali' },
      seats: 1,
      allowPool: true, // the default
      coPassengerCount: 0,
      fare: { estimatedSolo: 8000, estimatedPooled: 6400, poolDiscount: null, final: null },
    });
    expect(res.body.ride.expiresAt).toEqual(expect.any(String));
  });

  it('records the booking in the audit trail (NONE -> REQUESTED)', async () => {
    const res = await book('nusrat');

    const events = await reload.events({ rideRequestId: res.body.ride.id });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      fromStatus: 'NONE',
      toStatus: 'REQUESTED',
      actorUserId: cast.nusrat.id,
    });
  });

  it('remembers a passenger who does not want to share', async () => {
    const res = await book('nusrat', { allowPool: false });

    expect(res.status).toBe(201);
    expect(res.body.ride.allowPool).toBe(false);
  });

  it('blocks a second active ride with 409 ACTIVE_RIDE_EXISTS', async () => {
    await book('nusrat');
    const second = await book('nusrat');

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ACTIVE_RIDE_EXISTS');
  });

  it('survives a double-clicked submit: exactly one ride is created', async () => {
    const [a, b] = await Promise.all([book('nusrat'), book('nusrat')]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await prisma.rideRequest.count({ where: { passengerId: cast.nusrat.id } })).toBe(1);
  });

  it('lets a passenger book again once the earlier ride is cancelled', async () => {
    const first = await book('nusrat');
    await cancel('nusrat', first.body.ride.id);

    const again = await book('nusrat');

    expect(again.status).toBe(201);
  });

  it('expires a REQUESTED ride older than 10 minutes so the passenger can book again', async () => {
    const old = await ride('nusrat', { requestedAt: new Date(Date.now() - ELEVEN_MINUTES_MS) });

    const res = await book('nusrat');

    expect(res.status).toBe(201);
    expect((await reload.ride(old.id)).status).toBe('EXPIRED');
    const events = await reload.events({ rideRequestId: old.id });
    expect(events).toContainEqual(expect.objectContaining({ fromStatus: 'REQUESTED', toStatus: 'EXPIRED' }));
  });
});

describe('POST /rides: rejected requests', () => {
  it('rejects the same pickup and destination with 400 SAME_ZONE', async () => {
    const res = await book('nusrat', { destZoneId: zone['Banani'] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SAME_ZONE');
  });

  it('rejects more than 3 seats with 400 (Bullet has 3)', async () => {
    const res = await book('nusrat', { seats: 4 });

    expect(res.status).toBe(400);
    expect(res.body.error.details.fields).toHaveProperty('seats');
  });

  it('rejects an unknown zone with 404 ZONE_NOT_FOUND', async () => {
    const res = await book('nusrat', { destZoneId: randomUUID() });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ZONE_NOT_FOUND');
  });

  it('rejects the driver (Jashim) with 403: only passengers book rides', async () => {
    const res = await book('jashim');

    expect(res.status).toBe(403);
  });

  it('rejects a request without a token with 401', async () => {
    const res = await request(app).post('/rides').send(bookBody());

    expect(res.status).toBe(401);
  });
});

// --- GET /rides and GET /rides/:id -----------------------------------------------------------

describe('GET /rides', () => {
  it('shows a passenger only their own active ride', async () => {
    await book('nusrat');

    expect((await listRides('nusrat', 'active')).body.rides).toHaveLength(1);
    expect((await listRides('rafiq', 'active')).body.rides).toHaveLength(0);
  });

  it('defaults to the active scope', async () => {
    await book('nusrat');
    const res = await request(app).get('/rides').set(as('nusrat'));

    expect(res.body.rides).toHaveLength(1);
  });

  it('splits active from history, and lists history newest first', async () => {
    await ride('nusrat', { status: 'COMPLETED', createdAt: new Date(Date.now() - 2 * 3600_000) });
    await ride('nusrat', { status: 'CANCELLED', createdAt: new Date(Date.now() - 3600_000) });
    await book('nusrat');

    const active = await listRides('nusrat', 'active');
    const history = await listRides('nusrat', 'history');

    expect(active.body.rides.map((r) => r.status)).toEqual(['REQUESTED']);
    expect(history.body.rides.map((r) => r.status)).toEqual(['CANCELLED', 'COMPLETED']);
  });

  it('shows a ride that waited past 10 minutes as EXPIRED, in history', async () => {
    await ride('nusrat', { requestedAt: new Date(Date.now() - ELEVEN_MINUTES_MS) });

    const active = await listRides('nusrat', 'active');
    const history = await listRides('nusrat', 'history');

    expect(active.body.rides).toHaveLength(0);
    expect(history.body.rides.map((r) => r.status)).toEqual(['EXPIRED']);
  });

  it('rejects an unknown scope with 400', async () => {
    const res = await listRides('nusrat', 'everything');

    expect(res.status).toBe(400);
  });
});

describe('GET /rides/:id', () => {
  it('returns your own ride', async () => {
    const booked = await book('nusrat');
    const res = await fetchRide('nusrat', booked.body.ride.id);

    expect(res.status).toBe(200);
    expect(res.body.ride.id).toBe(booked.body.ride.id);
  });

  it("hides another passenger's ride: Rafiq gets 404, not 403", async () => {
    const booked = await book('nusrat');
    const res = await fetchRide('rafiq', booked.body.ride.id);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RIDE_NOT_FOUND');
  });

  it('answers a ride that does not exist with 404', async () => {
    expect((await fetchRide('nusrat', randomUUID())).status).toBe(404);
  });

  it('rejects a malformed id with 400', async () => {
    expect((await fetchRide('nusrat', 'abc')).status).toBe(400);
  });

  it('says how many others share the ride, never who they are', async () => {
    const trip = await bulletTrip({ seatsTaken: 2 });
    const nusrat = await ride('nusrat', { poolId: trip.id, status: 'MATCHED' });
    await ride('rafiq', { poolId: trip.id, status: 'MATCHED', destZoneId: zone['Gulshan 1'] });

    const res = await fetchRide('nusrat', nusrat.id);

    expect(res.body.ride.coPassengerCount).toBe(1);
    const everything = JSON.stringify(res.body);
    expect(everything).not.toContain('Rafiq');
    expect(everything).not.toContain(CAST.rafiq.phone);
  });
});

// --- POST /rides/:id/cancel ------------------------------------------------------------------

describe('POST /rides/:id/cancel: who and when', () => {
  it('cancels a waiting ride and records who and why', async () => {
    const booked = await book('nusrat');
    const res = await cancel('nusrat', booked.body.ride.id);

    expect(res.status).toBe(200);
    expect(res.body.ride.status).toBe('CANCELLED');

    const saved = await reload.ride(booked.body.ride.id);
    expect(saved).toMatchObject({ status: 'CANCELLED', cancelReason: 'PASSENGER', cancelledBy: cast.nusrat.id });
    const events = await reload.events({ rideRequestId: saved.id });
    expect(events).toContainEqual(expect.objectContaining({ fromStatus: 'REQUESTED', toStatus: 'CANCELLED' }));
  });

  it("can't touch another user's ride: Rafiq cancelling Nusrat's ride gets 404 and changes nothing", async () => {
    const booked = await book('nusrat');
    const res = await cancel('rafiq', booked.body.ride.id);

    expect(res.status).toBe(404);
    expect((await reload.ride(booked.body.ride.id)).status).toBe('REQUESTED');
  });

  it('refuses to cancel twice with 409 INVALID_TRANSITION', async () => {
    const booked = await book('nusrat');
    await cancel('nusrat', booked.body.ride.id);
    const again = await cancel('nusrat', booked.body.ride.id);

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_TRANSITION');
  });

  it.each(['COMPLETED', 'EXPIRED'])('refuses to cancel a %s ride with 409', async (status) => {
    const finished = await ride('nusrat', { status });
    const res = await cancel('nusrat', finished.id);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('refuses to cancel once the trip has STARTED, and leaves the pool untouched', async () => {
    const trip = await bulletTrip({ seatsTaken: 1, status: 'STARTED' });
    const riding = await ride('nusrat', { poolId: trip.id, status: 'STARTED' });

    const res = await cancel('nusrat', riding.id);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect((await reload.ride(riding.id)).status).toBe('STARTED');
    expect((await reload.pool(trip.id)).seatsTaken).toBe(1);
  });
});

describe('POST /rides/:id/cancel: shared Bullet', () => {
  it("frees the leaving passenger's seats and leaves the others riding", async () => {
    const trip = await bulletTrip({ seatsTaken: 3 });
    const nusrat = await ride('nusrat', { poolId: trip.id, status: 'MATCHED', seats: 2 });
    const rafiq = await ride('rafiq', { poolId: trip.id, status: 'MATCHED', destZoneId: zone['Gulshan 1'] });

    const res = await cancel('nusrat', nusrat.id);

    expect(res.status).toBe(200);
    expect(await reload.pool(trip.id)).toMatchObject({ seatsTaken: 1, status: 'MATCHED' });
    expect(await reload.ride(nusrat.id)).toMatchObject({ status: 'CANCELLED', poolId: null });
    expect(await reload.ride(rafiq.id)).toMatchObject({ status: 'MATCHED', poolId: trip.id });
  });

  it('still allows cancelling after the driver has arrived', async () => {
    const trip = await bulletTrip({ seatsTaken: 2, status: 'DRIVER_ARRIVED' });
    const nusrat = await ride('nusrat', { poolId: trip.id, status: 'DRIVER_ARRIVED' });
    await ride('rafiq', { poolId: trip.id, status: 'DRIVER_ARRIVED', destZoneId: zone['Gulshan 1'] });

    const res = await cancel('nusrat', nusrat.id);

    expect(res.status).toBe(200);
    expect(await reload.pool(trip.id)).toMatchObject({ seatsTaken: 1, status: 'DRIVER_ARRIVED' });
  });

  it('cancels the whole pool when its last passenger cancels', async () => {
    const trip = await bulletTrip({ seatsTaken: 1 });
    const nusrat = await ride('nusrat', { poolId: trip.id, status: 'MATCHED' });

    await cancel('nusrat', nusrat.id);

    const saved = await reload.pool(trip.id);
    expect(saved).toMatchObject({ status: 'CANCELLED', seatsTaken: 0 });
    expect(saved.cancelledAt).not.toBeNull();
    const events = await reload.events({ poolId: trip.id, rideRequestId: null });
    expect(events).toContainEqual(expect.objectContaining({ toStatus: 'CANCELLED', reason: 'ALL_MEMBERS_CANCELLED' }));
  });

  it('frees the seats exactly once when the cancel button is double-clicked', async () => {
    const trip = await bulletTrip({ seatsTaken: 3 });
    const nusrat = await ride('nusrat', { poolId: trip.id, status: 'MATCHED', seats: 2 });
    await ride('rafiq', { poolId: trip.id, status: 'MATCHED', destZoneId: zone['Gulshan 1'] });

    const [a, b] = await Promise.all([cancel('nusrat', nusrat.id), cancel('nusrat', nusrat.id)]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await reload.pool(trip.id)).seatsTaken).toBe(1); // 3 - 2, not 3 - 4
  });
});
