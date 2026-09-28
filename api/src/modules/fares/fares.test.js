import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { pool } from '../../lib/db.js';
import { CAST, createCast, removeCast, seedZones, loginToken } from '../../test/helpers.js';

let zone; // { 'Banani': id, ... }
let nusratToken;

const estimate = (body, token = nusratToken) =>
  request(app).post('/fares/estimate').set('Authorization', `Bearer ${token}`).send(body);

beforeAll(async () => {
  await createCast();
  zone = await seedZones();
  nusratToken = await loginToken(CAST.nusrat);
});

afterAll(async () => {
  await removeCast();
  await prisma.$disconnect();
  await pool.end();
});

describe('POST /fares/estimate: the story fares', () => {
  it('prices Nusrat (Banani -> Mohakhali): solo ৳80.00, pooled ৳64.00', async () => {
    const res = await estimate({ pickupZoneId: zone['Banani'], destZoneId: zone['Mohakhali'], seats: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ distanceM: 2500, solo: 8000, pooled: 6400 });
  });

  it('prices Rafiq (Banani -> Gulshan 1): solo ৳90.00, pooled ৳72.00', async () => {
    const res = await estimate({ pickupZoneId: zone['Banani'], destZoneId: zone['Gulshan 1'], seats: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ distanceM: 3000, solo: 9000, pooled: 7200 });
  });

  it('charges per seat: 2 seats double the fare', async () => {
    const res = await estimate({ pickupZoneId: zone['Banani'], destZoneId: zone['Mohakhali'], seats: 2 });

    expect(res.body).toMatchObject({ solo: 16000, pooled: 12800 });
  });

  it('gives the same price in both directions (distance is symmetric)', async () => {
    const there = await estimate({ pickupZoneId: zone['Banani'], destZoneId: zone['Mohakhali'], seats: 1 });
    const back = await estimate({ pickupZoneId: zone['Mohakhali'], destZoneId: zone['Banani'], seats: 1 });

    expect(back.body.solo).toBe(there.body.solo);
    expect(back.body.pooled).toBe(there.body.pooled);
  });
});

describe('POST /fares/estimate: bad requests', () => {
  it('rejects the same pickup and destination with 400 SAME_ZONE', async () => {
    const res = await estimate({ pickupZoneId: zone['Banani'], destZoneId: zone['Banani'], seats: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SAME_ZONE');
  });

  it('rejects a zone that does not exist with 404 ZONE_NOT_FOUND', async () => {
    const res = await estimate({ pickupZoneId: zone['Banani'], destZoneId: randomUUID(), seats: 1 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ZONE_NOT_FOUND');
  });

  it.each([
    ['0 seats', { seats: 0 }, 'seats'],
    ['4 seats (Bullet has 3)', { seats: 4 }, 'seats'],
    ['a fractional seat count', { seats: 1.5 }, 'seats'],
    ['a zone id that is not a UUID', { destZoneId: 'Mohakhali' }, 'destZoneId'],
  ])('rejects %s with 400 and names the field', async (_label, override, field) => {
    const body = { pickupZoneId: zone['Banani'], destZoneId: zone['Mohakhali'], seats: 1, ...override };
    const res = await estimate(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fields).toHaveProperty(field);
  });
});

describe('POST /fares/estimate: access', () => {
  const body = () => ({ pickupZoneId: zone['Banani'], destZoneId: zone['Mohakhali'], seats: 1 });

  it('rejects a request without a token with 401', async () => {
    const res = await request(app).post('/fares/estimate').send(body());

    expect(res.status).toBe(401);
  });

  it('rejects the driver (Jashim) with 403: estimates are for passengers', async () => {
    const res = await estimate(body(), await loginToken(CAST.jashim));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
