import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import { app } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { pool } from '../../lib/db.js';
import { env } from '../../lib/env.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { errorHandler } from '../../middleware/errorHandler.js';

const PASSWORD = 'tesla1234';
const JASHIM = { name: 'Jashim', phone: '01711000001' };
const NUSRAT = { name: 'Nusrat', phone: '01711000002' };
const RAFIQ = { name: 'Rafiq', phone: '01711000003' };
const SHIRIN = { name: 'Shirin', phone: '01711000004' };
const CAST_PHONES = [JASHIM, NUSRAT, RAFIQ, SHIRIN].map((p) => p.phone);

const post = (path, body) => request(app).post(path).send(body);

async function loginToken(person) {
  const res = await post('/auth/login', { phone: person.phone, password: PASSWORD });
  return res.body.token;
}

const removeCast = () => prisma.user.deleteMany({ where: { phone: { in: CAST_PHONES } } });

beforeAll(async () => {
  // Safety net: these tests delete users, so refuse to run against anything but a *_test database
  if (!env.databaseUrl?.includes('_test')) {
    throw new Error(`Refusing to run tests against a non-test database: ${env.databaseUrl}`);
  }

  await removeCast();
  const passwordHash = await bcrypt.hash(PASSWORD, 4); // low cost = faster tests
  // Drivers can't self-register, so Jashim is created directly (like the seed does)
  await prisma.user.create({ data: { ...JASHIM, passwordHash, role: 'DRIVER' } });
  await prisma.user.create({ data: { ...NUSRAT, passwordHash, role: 'PASSENGER' } });
});

afterAll(async () => {
  await removeCast();
  await prisma.$disconnect();
  await pool.end();
});

describe('POST /auth/register', () => {
  it('creates a passenger account and returns a token, never the password hash', async () => {
    const res = await post('/auth/register', { ...RAFIQ, password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Rafiq', phone: RAFIQ.phone, role: 'PASSENGER' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(typeof res.body.token).toBe('string');

    const saved = await prisma.user.findUnique({ where: { phone: RAFIQ.phone } });
    expect(saved.passwordHash).not.toBe(PASSWORD); // stored hashed
  });

  it("can't be used to register a driver: a role in the body is ignored", async () => {
    const res = await post('/auth/register', { ...SHIRIN, password: PASSWORD, role: 'DRIVER' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('PASSENGER');
  });

  it('rejects a phone number that is already registered with 409', async () => {
    const res = await post('/auth/register', { ...NUSRAT, password: PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PHONE_TAKEN');
  });

  it('rejects invalid input with 400 and a message per field', async () => {
    const res = await post('/auth/register', { name: 'A', phone: '12345', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.details.fields)).toEqual(
      expect.arrayContaining(['name', 'phone', 'password']),
    );
  });
});

describe('POST /auth/login', () => {
  it('logs in a passenger (Nusrat)', async () => {
    const res = await post('/auth/login', { phone: NUSRAT.phone, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Nusrat', role: 'PASSENGER' });
    expect(typeof res.body.token).toBe('string');
  });

  it('logs in a driver (Jashim) through the same endpoint', async () => {
    const res = await post('/auth/login', { phone: JASHIM.phone, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('DRIVER');
  });

  it('rejects a wrong password with 401', async () => {
    const res = await post('/auth/login', { phone: NUSRAT.phone, password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('answers an unknown phone exactly like a wrong password (no account enumeration)', async () => {
    const wrongPassword = await post('/auth/login', { phone: NUSRAT.phone, password: 'wrong-password' });
    const unknownPhone = await post('/auth/login', { phone: '01999999999', password: PASSWORD });

    expect(unknownPhone.status).toBe(401);
    expect(unknownPhone.body).toEqual(wrongPassword.body);
  });
});

describe('GET /me', () => {
  it('returns the logged-in user for a valid token', async () => {
    const token = await loginToken(NUSRAT);
    const res = await request(app).get('/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Nusrat', phone: NUSRAT.phone, role: 'PASSENGER' });
  });

  it('rejects a request without a token with 401', async () => {
    const res = await request(app).get('/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a forged or garbage token with 401', async () => {
    const res = await request(app).get('/me').set('Authorization', 'Bearer not.a.real-token');

    expect(res.status).toBe(401);
  });
});

describe('requireRole guard', () => {
  // A tiny throwaway app, so the guard is tested before real driver routes exist
  const guarded = express();
  guarded.get('/driver-only', requireAuth, requireRole('DRIVER'), (req, res) => res.json({ ok: true }));
  guarded.use(errorHandler);

  it('blocks a passenger (Nusrat) from a driver-only route with 403', async () => {
    const token = await loginToken(NUSRAT);
    const res = await request(guarded).get('/driver-only').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('lets the driver (Jashim) through', async () => {
    const token = await loginToken(JASHIM);
    const res = await request(guarded).get('/driver-only').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});
