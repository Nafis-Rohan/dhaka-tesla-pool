import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';

const DEMO_PASSWORD = 'tesla1234';

const ZONES = [
  { name: 'Banani', lat: 23.7937, lng: 90.4066 },
  { name: 'Gulshan 1', lat: 23.7806, lng: 90.4162 },
  { name: 'Gulshan 2', lat: 23.7925, lng: 90.4143 },
  { name: 'Mohakhali', lat: 23.778, lng: 90.4055 },
  { name: 'Farmgate', lat: 23.7561, lng: 90.3872 },
  { name: 'Dhanmondi', lat: 23.7461, lng: 90.3742 },
  { name: 'Mirpur', lat: 23.8069, lng: 90.3687 },
  { name: 'Uttara', lat: 23.8759, lng: 90.3795 },
  { name: 'Bashundhara', lat: 23.8193, lng: 90.4526 },
];

// Neighbouring zones (rules.md B2)
const ADJACENT = [
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
];

// Fixed distances in metres, one entry per zone pair (9 zones = 36 pairs)
const DISTANCES_M = [
  ['Banani', 'Mohakhali', 2500],
  ['Banani', 'Gulshan 1', 3000],
  ['Banani', 'Gulshan 2', 1800],
  ['Banani', 'Farmgate', 4500],
  ['Banani', 'Dhanmondi', 7000],
  ['Banani', 'Mirpur', 8000],
  ['Banani', 'Uttara', 11000],
  ['Banani', 'Bashundhara', 5500],
  ['Gulshan 1', 'Gulshan 2', 1500],
  ['Gulshan 1', 'Mohakhali', 2800],
  ['Gulshan 1', 'Farmgate', 5500],
  ['Gulshan 1', 'Dhanmondi', 8000],
  ['Gulshan 1', 'Mirpur', 10000],
  ['Gulshan 1', 'Uttara', 12000],
  ['Gulshan 1', 'Bashundhara', 4000],
  ['Gulshan 2', 'Mohakhali', 3000],
  ['Gulshan 2', 'Farmgate', 6000],
  ['Gulshan 2', 'Dhanmondi', 8500],
  ['Gulshan 2', 'Mirpur', 9500],
  ['Gulshan 2', 'Uttara', 10500],
  ['Gulshan 2', 'Bashundhara', 3500],
  ['Mohakhali', 'Farmgate', 2500],
  ['Mohakhali', 'Dhanmondi', 5000],
  ['Mohakhali', 'Mirpur', 7500],
  ['Mohakhali', 'Uttara', 12500],
  ['Mohakhali', 'Bashundhara', 6000],
  ['Farmgate', 'Dhanmondi', 2500],
  ['Farmgate', 'Mirpur', 6000],
  ['Farmgate', 'Uttara', 13500],
  ['Farmgate', 'Bashundhara', 9000],
  ['Dhanmondi', 'Mirpur', 7000],
  ['Dhanmondi', 'Uttara', 15500],
  ['Dhanmondi', 'Bashundhara', 11000],
  ['Mirpur', 'Uttara', 9500],
  ['Mirpur', 'Bashundhara', 12000],
  ['Uttara', 'Bashundhara', 6500],
];

const PEOPLE = [
  { name: 'Jashim', phone: '01711000001', role: 'DRIVER' },
  { name: 'Nusrat', phone: '01711000002', role: 'PASSENGER' },
  { name: 'Rafiq', phone: '01711000003', role: 'PASSENGER' },
  { name: 'Shirin', phone: '01711000004', role: 'PASSENGER' },
];

// zone_adjacency / zone_distances store each pair once, smaller id first
function orderedPair(idA, idB) {
  return idA < idB ? [idA, idB] : [idB, idA];
}

async function seedZones() {
  const ids = {};
  for (const zone of ZONES) {
    const row = await prisma.zone.upsert({
      where: { name: zone.name },
      update: { lat: zone.lat, lng: zone.lng },
      create: zone,
    });
    ids[zone.name] = row.id;
  }

  for (const [nameA, nameB] of ADJACENT) {
    const [zoneAId, zoneBId] = orderedPair(ids[nameA], ids[nameB]);
    await prisma.zoneAdjacency.upsert({
      where: { zoneAId_zoneBId: { zoneAId, zoneBId } },
      update: {},
      create: { zoneAId, zoneBId },
    });
  }

  for (const [nameA, nameB, distanceM] of DISTANCES_M) {
    const [zoneAId, zoneBId] = orderedPair(ids[nameA], ids[nameB]);
    await prisma.zoneDistance.upsert({
      where: { zoneAId_zoneBId: { zoneAId, zoneBId } },
      update: { distanceM },
      create: { zoneAId, zoneBId, distanceM },
    });
  }

  return ids;
}

async function seedUsers() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = {};
  for (const person of PEOPLE) {
    users[person.name] = await prisma.user.upsert({
      where: { phone: person.phone },
      update: { name: person.name, role: person.role },
      create: { ...person, passwordHash },
    });
  }
  return users;
}

async function seedBullet(jashim) {
  return prisma.vehicle.upsert({
    where: { driverId: jashim.id },
    update: {},
    create: {
      driverId: jashim.id,
      name: 'Bullet',
      plate: 'Dhaka Metro Ha 11-2233',
      capacity: 3,
    },
  });
}

// One finished trip: Nusrat + Rafiq shared Bullet (the story from the PRD, 8:41 AM Dhaka time)
async function seedHistory({ zones, users, bullet }) {
  const already = await prisma.pool.count({ where: { vehicleId: bullet.id } });
  if (already > 0) return;

  const start = new Date('2026-09-20T02:41:00Z');
  const at = (minutes) => new Date(start.getTime() + minutes * 60000);
  const jashimId = users.Jashim.id;

  const pool = await prisma.pool.create({
    data: {
      vehicleId: bullet.id,
      pickupZoneId: zones['Banani'],
      status: 'COMPLETED',
      isShared: true,
      capacity: 3,
      seatsTaken: 2,
      arrivedAt: at(5),
      startedAt: at(8),
      completedAt: at(20),
      createdAt: at(1),
    },
  });

  // Fares in paisa: Nusrat 3000 + 5000 = 8000 solo, 6400 pooled. Rafiq 3000 + 6000 = 9000 solo, 7200 pooled.
  const nusrat = await prisma.rideRequest.create({
    data: {
      passengerId: users.Nusrat.id,
      poolId: pool.id,
      pickupZoneId: zones['Banani'],
      destZoneId: zones['Mohakhali'],
      seats: 1,
      allowPool: true,
      status: 'COMPLETED',
      baseFare: 3000,
      distanceCharge: 5000,
      poolDiscount: 1600,
      finalFare: 6400,
      estSoloFare: 8000,
      estPooledFare: 6400,
      paymentMethod: 'CASH',
      requestedAt: start,
      createdAt: start,
    },
  });

  const rafiq = await prisma.rideRequest.create({
    data: {
      passengerId: users.Rafiq.id,
      poolId: pool.id,
      pickupZoneId: zones['Banani'],
      destZoneId: zones['Gulshan 1'],
      seats: 1,
      allowPool: true,
      status: 'COMPLETED',
      baseFare: 3000,
      distanceCharge: 6000,
      poolDiscount: 1800,
      finalFare: 7200,
      estSoloFare: 9000,
      estPooledFare: 7200,
      paymentMethod: 'CASH',
      requestedAt: at(2),
      createdAt: at(2),
    },
  });

  const requestEvents = (rideRequestId, matchedAt, completedAt) => [
    { rideRequestId, fromStatus: 'REQUESTED', toStatus: 'MATCHED', actorUserId: jashimId, createdAt: at(matchedAt) },
    { rideRequestId, fromStatus: 'MATCHED', toStatus: 'DRIVER_ARRIVED', actorUserId: jashimId, createdAt: at(5) },
    { rideRequestId, fromStatus: 'DRIVER_ARRIVED', toStatus: 'STARTED', actorUserId: jashimId, createdAt: at(8) },
    { rideRequestId, fromStatus: 'STARTED', toStatus: 'COMPLETED', actorUserId: jashimId, createdAt: at(completedAt) },
  ];

  await prisma.rideEvent.createMany({
    data: [
      { poolId: pool.id, fromStatus: 'MATCHED', toStatus: 'DRIVER_ARRIVED', actorUserId: jashimId, createdAt: at(5) },
      { poolId: pool.id, fromStatus: 'DRIVER_ARRIVED', toStatus: 'STARTED', actorUserId: jashimId, createdAt: at(8) },
      { poolId: pool.id, fromStatus: 'STARTED', toStatus: 'COMPLETED', actorUserId: jashimId, createdAt: at(20) },
      ...requestEvents(nusrat.id, 1, 17),
      ...requestEvents(rafiq.id, 3, 20),
    ],
  });
}

async function main() {
  const zones = await seedZones();
  const users = await seedUsers();
  const bullet = await seedBullet(users.Jashim);
  await seedHistory({ zones, users, bullet });

  console.log('Seed done: 9 zones, Jashim + Bullet, Nusrat, Rafiq, Shirin, 1 finished pool.');
  console.log(`Demo password for everyone: ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
