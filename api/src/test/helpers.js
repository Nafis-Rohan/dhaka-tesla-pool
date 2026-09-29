// Shared setup for integration tests. Not a test file itself (the name doesn't end in .test.js).
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../lib/env.js';

export const PASSWORD = 'tesla1234';

// The story cast, same phones as the seed
export const CAST = {
  jashim: { name: 'Jashim', phone: '01711000001', role: 'DRIVER' },
  nusrat: { name: 'Nusrat', phone: '01711000002', role: 'PASSENGER' },
  rafiq: { name: 'Rafiq', phone: '01711000003', role: 'PASSENGER' },
  shirin: { name: 'Shirin', phone: '01711000004', role: 'PASSENGER' },
  // A second driver, only for tests: someone for the race loser to lose to (two drivers, one ride)
  kamal: { name: 'Kamal', phone: '01711000005', role: 'DRIVER' },
};
const CAST_PHONES = Object.values(CAST).map((person) => person.phone);

// The tests delete data, so refuse to run against anything but a *_test database
export function assertTestDatabase() {
  if (!env.databaseUrl?.includes('_test')) {
    throw new Error(`Refusing to run tests against a non-test database: ${env.databaseUrl}`);
  }
}

// Events, requests, pools and vehicles all point at users, so they go first (test database only)
export async function resetRides() {
  assertTestDatabase();
  await prisma.rideEvent.deleteMany();
  await prisma.rideRequest.deleteMany();
  await prisma.pool.deleteMany();
  await prisma.vehicle.deleteMany();
}

export async function removeCast() {
  await resetRides();
  return prisma.user.deleteMany({ where: { phone: { in: CAST_PHONES } } });
}

// Fresh Jashim, Nusrat, Rafiq and Shirin. Returns them by key: { jashim, nusrat, ... }
export async function createCast() {
  assertTestDatabase();
  await removeCast();

  const passwordHash = await bcrypt.hash(PASSWORD, 4); // low cost = faster tests
  const users = {};
  for (const [key, person] of Object.entries(CAST)) {
    users[key] = await prisma.user.create({ data: { ...person, passwordHash } });
  }
  return users;
}

const ZONES = [
  { name: 'Banani', lat: 23.7937, lng: 90.4066 },
  { name: 'Gulshan 1', lat: 23.7806, lng: 90.4162 },
  { name: 'Mohakhali', lat: 23.778, lng: 90.4055 },
  { name: 'Uttara', lat: 23.8759, lng: 90.3795 }, // far from everything the story uses: never a match
];

// Neighbouring zones (same as the seed). Uttara has none of these, which is what makes it "not compatible".
const ADJACENT = [
  ['Banani', 'Gulshan 1'],
  ['Banani', 'Mohakhali'],
  ['Gulshan 1', 'Mohakhali'],
];

// Same distances as the seed (rules.md B2)
const DISTANCES_M = [
  ['Banani', 'Mohakhali', 2500],
  ['Banani', 'Gulshan 1', 3000],
  ['Gulshan 1', 'Mohakhali', 2800],
  ['Banani', 'Uttara', 11000],
];

// Zones are reference data (like in the seed), so this is an upsert and they are left in place:
// later tests point rides at them and can't delete them. Returns { 'Banani': id, ... }
export async function seedZones() {
  assertTestDatabase();

  const ids = {};
  for (const zone of ZONES) {
    const row = await prisma.zone.upsert({ where: { name: zone.name }, update: zone, create: zone });
    ids[zone.name] = row.id;
  }

  for (const [nameA, nameB, distanceM] of DISTANCES_M) {
    // pairs are stored once, smaller id first
    const [zoneAId, zoneBId] = ids[nameA] < ids[nameB] ? [ids[nameA], ids[nameB]] : [ids[nameB], ids[nameA]];
    await prisma.zoneDistance.upsert({
      where: { zoneAId_zoneBId: { zoneAId, zoneBId } },
      update: { distanceM },
      create: { zoneAId, zoneBId, distanceM },
    });
  }

  for (const [nameA, nameB] of ADJACENT) {
    const [zoneAId, zoneBId] = ids[nameA] < ids[nameB] ? [ids[nameA], ids[nameB]] : [ids[nameB], ids[nameA]];
    await prisma.zoneAdjacency.upsert({
      where: { zoneAId_zoneBId: { zoneAId, zoneBId } },
      update: {},
      create: { zoneAId, zoneBId },
    });
  }

  return ids;
}

// Log in through the real endpoint and return the JWT
export async function loginToken(person) {
  const res = await request(app)
    .post('/auth/login')
    .send({ phone: person.phone, password: PASSWORD });
  return res.body.token;
}

// --- Direct-to-database fixtures -------------------------------------------------------------
// No pool can exist through the API until drivers can accept rides, so tests insert them directly.

// Jashim's three-seat Bullet (pass overrides for another driver's Tesla, e.g. Kamal's "Rocket")
export function createBullet(driverId, overrides = {}) {
  return prisma.vehicle.create({
    data: { driverId, name: 'Bullet', plate: 'DHAKA-TESLA-3', capacity: 3, ...overrides },
  });
}

// One vehicle trip. seatsTaken must match the seats of the requests you put in it.
export function createPool({ vehicleId, pickupZoneId, seatsTaken = 0, status = 'MATCHED', isShared = true, capacity = 3, ...overrides }) {
  return prisma.pool.create({
    data: { vehicleId, pickupZoneId, seatsTaken, status, isShared, capacity, ...overrides },
  });
}

// One passenger's request in any state. Fares default to Nusrat's (Banani -> Mohakhali, 1 seat).
// Overrides can set poolId, status, seats, requestedAt, createdAt ...
export function insertRide({ passengerId, pickupZoneId, destZoneId, ...overrides }) {
  return prisma.rideRequest.create({
    data: {
      passengerId,
      pickupZoneId,
      destZoneId,
      seats: 1,
      allowPool: true,
      status: 'REQUESTED',
      baseFare: 3000,
      distanceCharge: 5000,
      estSoloFare: 8000,
      estPooledFare: 6400,
      ...overrides,
    },
  });
}
