import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { pool } from '../../lib/db.js';
import { CAST, createCast, removeCast, seedZones, loginToken } from '../../test/helpers.js';

beforeAll(async () => {
  await createCast();
  await seedZones();
});

afterAll(async () => {
  await removeCast();
  await prisma.$disconnect();
  await pool.end();
});

describe('GET /zones', () => {
  it('rejects a request without a token with 401', async () => {
    const res = await request(app).get('/zones');

    expect(res.status).toBe(401);
  });

  it('lists the zones, sorted by name, with numeric coordinates', async () => {
    const token = await loginToken(CAST.nusrat);
    const res = await request(app).get('/zones').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    const names = res.body.zones.map((zone) => zone.name);
    expect(names).toEqual(expect.arrayContaining(['Banani', 'Gulshan 1', 'Mohakhali']));
    expect(names).toEqual([...names].sort());

    const banani = res.body.zones.find((zone) => zone.name === 'Banani');
    expect(banani.id).toEqual(expect.any(String));
    expect(banani.lat).toBeCloseTo(23.7937);
    expect(banani.lng).toBeCloseTo(90.4066);
  });

  it('is also available to the driver (Jashim): any logged-in user can read zones', async () => {
    const token = await loginToken(CAST.jashim);
    const res = await request(app).get('/zones').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});
