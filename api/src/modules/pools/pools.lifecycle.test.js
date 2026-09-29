import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
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

// The rule behind "capacity can never be exceeded": whatever just happened, every pool's
// seats_taken equals the seats of the requests that are actually in it.
afterEach(async () => {
  const pools = await prisma.pool.findMany({ include: { requests: true } });
  for (const trip of pools) {
    const seats = trip.requests.reduce((sum, ride) => sum + ride.seats, 0);
    expect(trip.seatsTaken, `pool ${trip.id} (${trip.status})`).toBe(seats);
    expect(trip.seatsTaken).toBeLessThanOrEqual(trip.capacity);
  }
});

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
const cancelRide = (who, rideId) => request(app).post(`/rides/${rideId}/cancel`).set(as(who));
const getRide = async (who, rideId) => (await request(app).get(`/rides/${rideId}`).set(as(who))).body.ride;

const goOnline = (who, zoneName = 'Banani') =>
  request(app).put('/driver/availability').set(as(who)).send({ online: true, zoneId: zone[zoneName] });
const goOffline = (who) => request(app).put('/driver/availability').set(as(who)).send({ online: false });
const feed = (who) => request(app).get('/driver/requests').set(as(who));
const accept = (who, rideId) => request(app).post(`/driver/requests/${rideId}/accept`).set(as(who));
const history = (who) => request(app).get('/driver/history').set(as(who));

const currentTrip = (who) => request(app).get('/driver/pool/current').set(as(who));
const arrive = (who) => request(app).post('/driver/pool/arrive').set(as(who));
const start = (who) => request(app).post('/driver/pool/start').set(as(who));
const cancelTrip = (who) => request(app).post('/driver/pool/cancel').set(as(who));
const dropOff = (who, rideId) => request(app).post(`/driver/pool/requests/${rideId}/dropoff`).set(as(who));
const noShow = (who, rideId) => request(app).post(`/driver/pool/requests/${rideId}/no-show`).set(as(who));

const jashimsBullet = () => createBullet(cast.jashim.id);
const kamalsRocket = () => createBullet(cast.kamal.id, { name: 'Rocket', plate: 'DHAKA-TESLA-2' });

const reload = {
  ride: (id) => prisma.rideRequest.findUnique({ where: { id } }),
  pool: (id) => prisma.pool.findUnique({ where: { id } }),
};

// Jashim is online in Banani. Nusrat booked and he accepted; Rafiq booked two minutes later and
// was added automatically. Everything here goes through the real endpoints.
async function tripWithNusratAndRafiq() {
  await jashimsBullet();
  await goOnline('jashim');

  const nusrat = (await book('nusrat')).body.ride;
  const accepted = await accept('jashim', nusrat.id);
  const rafiq = (await book('rafiq', { destZoneId: zone['Gulshan 1'] })).body.ride;

  expect(rafiq.status).toBe('MATCHED');
  return { nusrat, rafiq, poolId: accepted.body.pool.id };
}

// The same, with only Nusrat aboard
async function tripWithNusratAlone() {
  await jashimsBullet();
  await goOnline('jashim');

  const nusrat = (await book('nusrat')).body.ride;
  const accepted = await accept('jashim', nusrat.id);
  return { nusrat, poolId: accepted.body.pool.id };
}

// --- the whole story -------------------------------------------------------------------------

describe('a trip from the first request to the last drop-off', () => {
  it("runs Nusrat's and Rafiq's trip, locks their pooled fares, and keeps Shirin out", async () => {
    await jashimsBullet();
    await goOnline('jashim');

    // Nusrat books. Nobody is driving her yet.
    const nusrat = (await book('nusrat')).body.ride;
    expect(nusrat.status).toBe('REQUESTED');

    // Jashim sees her in his feed and accepts
    const seen = await feed('jashim');
    expect(seen.body.requests.map((request) => request.id)).toEqual([nusrat.id]);
    const accepted = await accept('jashim', nusrat.id);
    expect(accepted.status).toBe(200);

    // Two minutes later Rafiq books almost the same route and is added automatically
    const rafiq = (await book('rafiq', { destZoneId: zone['Gulshan 1'] })).body.ride;
    expect(rafiq).toMatchObject({ status: 'MATCHED', coPassengerCount: 1 });

    // Jashim arrives at the pickup: everyone is now DRIVER_ARRIVED
    const arrived = await arrive('jashim');
    expect(arrived.status).toBe(200);
    expect(arrived.body.pool.status).toBe('DRIVER_ARRIVED');
    expect(arrived.body.pool.passengers.map((passenger) => passenger.status)).toEqual([
      'DRIVER_ARRIVED',
      'DRIVER_ARRIVED',
    ]);
    expect((await getRide('nusrat', nusrat.id)).status).toBe('DRIVER_ARRIVED');

    // Shirin tries for the last seat thirty seconds too late: the trip is sealed
    const shirin = (await book('shirin')).body.ride;
    expect(shirin.status).toBe('REQUESTED');

    // Jashim starts: the FINAL FARES are locked, with the pool discount, because two are aboard
    const started = await start('jashim');
    expect(started.status).toBe(200);
    expect(started.body.pool.status).toBe('STARTED');

    expect((await getRide('nusrat', nusrat.id)).fare).toMatchObject({ poolDiscount: 1600, final: 6400 });
    expect((await getRide('rafiq', rafiq.id)).fare).toMatchObject({ poolDiscount: 1800, final: 7200 });

    // Nusrat is dropped at Mohakhali first; the trip goes on for Rafiq
    const first = await dropOff('jashim', nusrat.id);
    expect(first.body.pool.status).toBe('STARTED');
    expect((await getRide('nusrat', nusrat.id)).status).toBe('COMPLETED');

    // Rafiq is the last one off, and the trip completes by itself
    const last = await dropOff('jashim', rafiq.id);
    expect(last.body.pool.status).toBe('COMPLETED');
    expect(last.body.pool.completedAt).not.toBeNull();

    // Cash was recorded for both
    const rides = await prisma.rideRequest.findMany({ where: { id: { in: [nusrat.id, rafiq.id] } } });
    expect(rides.map((ride) => [ride.status, ride.paymentMethod])).toEqual([
      ['COMPLETED', 'CASH'],
      ['COMPLETED', 'CASH'],
    ]);

    // "Explain exactly what happened": Nusrat's ride tells its whole story, in order
    const events = await prisma.rideEvent.findMany({
      where: { rideRequestId: nusrat.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((event) => `${event.fromStatus}>${event.toStatus}`)).toEqual([
      'NONE>REQUESTED',
      'REQUESTED>MATCHED',
      'MATCHED>DRIVER_ARRIVED',
      'DRIVER_ARRIVED>STARTED',
      'STARTED>COMPLETED',
    ]);

    // Jashim is free again: no current trip, history shows it and the cash, and he can go offline
    expect((await currentTrip('jashim')).body.pool).toBeNull();
    const finished = (await history('jashim')).body.pools[0];
    expect(finished).toMatchObject({ status: 'COMPLETED', earnedFare: 13600 });
    expect((await goOffline('jashim')).status).toBe(200);
  });
});

// --- the current trip ------------------------------------------------------------------------

describe('GET /driver/pool/current', () => {
  it('is an empty state, not an error, when there is no trip', async () => {
    await jashimsBullet();

    const res = await currentTrip('jashim');

    expect(res.status).toBe(200);
    expect(res.body.pool).toBeNull();
  });

  it("shows the driver their passengers' names, seats and destinations, but no phone numbers", async () => {
    await tripWithNusratAndRafiq();

    const res = await currentTrip('jashim');

    expect(res.body.pool).toMatchObject({ status: 'MATCHED', seatsTaken: 2, seatsLeft: 1, capacity: 3 });
    const byName = Object.fromEntries(res.body.pool.passengers.map((passenger) => [passenger.name, passenger]));
    expect(byName.Nusrat).toMatchObject({ seats: 1, destination: { name: 'Mohakhali' } });
    expect(byName.Rafiq).toMatchObject({ seats: 1, destination: { name: 'Gulshan 1' } });
    expect(JSON.stringify(res.body)).not.toContain(CAST.nusrat.phone);
  });

  it('is for drivers only', async () => {
    expect((await currentTrip('nusrat')).status).toBe(403);
  });
});

// --- order of steps, and the fare lock -------------------------------------------------------

describe('arrive, start and the fare lock', () => {
  it('cannot arrive twice', async () => {
    await tripWithNusratAndRafiq();
    await arrive('jashim');

    const again = await arrive('jashim');

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('cannot start before arriving, and nothing changes', async () => {
    const { poolId } = await tripWithNusratAndRafiq();

    const res = await start('jashim');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect((await reload.pool(poolId)).status).toBe('MATCHED');
  });

  it('charges the solo fare when only one passenger is aboard at the start', async () => {
    const { nusrat } = await tripWithNusratAlone();
    await arrive('jashim');
    await start('jashim');

    expect((await getRide('nusrat', nusrat.id)).fare).toMatchObject({ poolDiscount: 0, final: 8000 });
  });

  it('takes the discount away if Rafiq cancels before the start: Nusrat pays ৳80.00', async () => {
    const { nusrat, rafiq } = await tripWithNusratAndRafiq();

    expect((await cancelRide('rafiq', rafiq.id)).status).toBe(200);
    await arrive('jashim');
    await start('jashim');

    expect((await getRide('nusrat', nusrat.id)).fare).toMatchObject({ poolDiscount: 0, final: 8000 });
  });
});

// --- drop-off --------------------------------------------------------------------------------

describe('POST /driver/pool/requests/:id/dropoff', () => {
  it('cannot drop a passenger off before the trip has started', async () => {
    const { nusrat } = await tripWithNusratAndRafiq();
    await arrive('jashim');

    const res = await dropOff('jashim', nusrat.id);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect((await reload.ride(nusrat.id)).status).toBe('DRIVER_ARRIVED');
  });

  it('cannot drop the same passenger off twice, and the trip stays open for the other', async () => {
    const { nusrat, poolId } = await tripWithNusratAndRafiq();
    await arrive('jashim');
    await start('jashim');
    await dropOff('jashim', nusrat.id);

    const again = await dropOff('jashim', nusrat.id);

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_TRANSITION');
    expect((await reload.pool(poolId)).status).toBe('STARTED');
  });
});

// --- no-show ---------------------------------------------------------------------------------

describe('POST /driver/pool/requests/:id/no-show', () => {
  it('cancels the missing passenger, frees the seat, and Nusrat loses the discount', async () => {
    const { nusrat, rafiq, poolId } = await tripWithNusratAndRafiq();
    await arrive('jashim');

    const res = await noShow('jashim', rafiq.id);

    expect(res.status).toBe(200);
    expect(res.body.pool.passengers.map((passenger) => passenger.name)).toEqual(['Nusrat']);
    expect(await reload.ride(rafiq.id)).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'NO_SHOW',
      cancelledBy: cast.jashim.id,
      poolId: null,
    });
    expect((await reload.pool(poolId)).seatsTaken).toBe(1);

    await start('jashim');
    expect((await getRide('nusrat', nusrat.id)).fare).toMatchObject({ poolDiscount: 0, final: 8000 });
  });

  it('cancels the whole trip when the only passenger is a no-show, and frees the driver', async () => {
    const { nusrat, poolId } = await tripWithNusratAlone();
    await arrive('jashim');

    await noShow('jashim', nusrat.id);

    expect((await reload.pool(poolId)).status).toBe('CANCELLED');
    expect((await currentTrip('jashim')).body.pool).toBeNull();
    expect((await goOffline('jashim')).status).toBe(200);
  });

  it('is only possible after the driver has arrived', async () => {
    const { rafiq } = await tripWithNusratAndRafiq();

    const res = await noShow('jashim', rafiq.id);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect((await reload.ride(rafiq.id)).status).toBe('MATCHED');
  });

  it('cannot be used on someone who is not in the driver’s trip', async () => {
    await tripWithNusratAlone();
    await arrive('jashim');
    const shirin = (await book('shirin')).body.ride; // just waiting for a driver

    const res = await noShow('jashim', shirin.id);

    expect(res.status).toBe(404);
    expect((await reload.ride(shirin.id)).status).toBe('REQUESTED');
  });
});

// --- the driver cancels ----------------------------------------------------------------------

describe('POST /driver/pool/cancel', () => {
  it("sends the passengers back to waiting, so they aren't punished, and another driver can take them", async () => {
    const { nusrat, rafiq, poolId } = await tripWithNusratAndRafiq();

    const res = await cancelTrip('jashim');

    expect(res.status).toBe(200);
    expect(res.body.pool).toMatchObject({ status: 'CANCELLED', seatsTaken: 0, passengers: [] });
    expect((await reload.pool(poolId)).cancelledAt).not.toBeNull();

    for (const passenger of [
      { who: 'nusrat', id: nusrat.id },
      { who: 'rafiq', id: rafiq.id },
    ]) {
      const ride = await getRide(passenger.who, passenger.id);
      expect(ride).toMatchObject({ status: 'REQUESTED', coPassengerCount: 0 });
      expect(ride.expiresAt).not.toBeNull(); // a fresh 10 minutes
      expect((await reload.ride(passenger.id)).poolId).toBeNull();
    }

    // Jashim is free, still online, and sees them waiting again
    expect((await feed('jashim')).body.requests).toHaveLength(2);
    expect((await goOffline('jashim')).status).toBe(200);

    // Kamal, another driver, can pick Nusrat up
    await kamalsRocket();
    await goOnline('kamal');
    expect((await accept('kamal', nusrat.id)).status).toBe(200);
  });

  it('is refused once the trip has started', async () => {
    const { nusrat, poolId } = await tripWithNusratAndRafiq();
    await arrive('jashim');
    await start('jashim');

    const res = await cancelTrip('jashim');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect((await reload.pool(poolId)).status).toBe('STARTED');
    expect((await reload.ride(nusrat.id)).status).toBe('STARTED');
  });
});

// --- staying in your own lane ----------------------------------------------------------------

describe('drivers only reach their own trip', () => {
  it("won't let Kamal drop off Jashim's passenger, even with Kamal's own trip under way", async () => {
    const { nusrat } = await tripWithNusratAndRafiq();
    await arrive('jashim');
    await start('jashim');

    // Kamal has a trip of his own with Shirin aboard
    const rocket = await kamalsRocket();
    const kamalsTrip = await createPool({
      vehicleId: rocket.id,
      pickupZoneId: zone['Banani'],
      status: 'STARTED',
      seatsTaken: 1,
    });
    await insertRide({
      passengerId: cast.shirin.id,
      pickupZoneId: zone['Banani'],
      destZoneId: zone['Mohakhali'],
      poolId: kamalsTrip.id,
      status: 'STARTED',
    });

    const res = await dropOff('kamal', nusrat.id);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RIDE_NOT_FOUND');
    expect((await reload.ride(nusrat.id)).status).toBe('STARTED');
  });

  it('gives a driver with no trip a 404 instead of touching anyone else’s', async () => {
    const { poolId } = await tripWithNusratAndRafiq();
    await kamalsRocket();

    const res = await arrive('kamal');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_ACTIVE_POOL');
    expect((await reload.pool(poolId)).status).toBe('MATCHED');
  });

  it('keeps passengers out of the driver’s controls', async () => {
    await tripWithNusratAlone();

    expect((await arrive('nusrat')).status).toBe(403);
    expect((await start('nusrat')).status).toBe(403);
    expect((await cancelTrip('nusrat')).status).toBe(403);
  });
});

// --- concurrency -----------------------------------------------------------------------------

describe('a passenger cancelling at the moment the driver accepts', () => {
  it('ends in one clear state every time, never a half-cancelled trip', async () => {
    // Repeated because a race that passes once proves little
    for (let round = 1; round <= 5; round++) {
      await resetRides();
      await jashimsBullet();
      await goOnline('jashim');
      const nusrat = (await book('nusrat')).body.ride;

      const [cancelled, accepted] = await Promise.all([cancelRide('nusrat', nusrat.id), accept('jashim', nusrat.id)]);

      // at least one of them won; both can win (accepted first, then cancelled out of the trip)
      expect([cancelled.status, accepted.status]).toContain(200);

      const saved = await reload.ride(nusrat.id);
      if (cancelled.status === 200) {
        expect(saved.status).toBe('CANCELLED');
        expect(saved.poolId).toBeNull();
      } else {
        expect(saved.status).toBe('MATCHED');
        expect(saved.poolId).not.toBeNull();
      }
      // (the afterEach check then proves every pool's seats still add up)
    }
  });
});
