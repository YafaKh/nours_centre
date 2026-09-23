import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';

const app = createApp();

function tamperCookie(cookieHeader: string): string {
  const eqIdx = cookieHeader.indexOf('=');
  const semiIdx = cookieHeader.indexOf(';');
  const end = semiIdx === -1 ? cookieHeader.length : semiIdx;
  const value = cookieHeader.slice(eqIdx + 1, end);
  const flipped = value.slice(0, -1) + (value.endsWith('0') ? '1' : '0');
  return `sid=${flipped}${cookieHeader.slice(end)}`;
}

describe('session validation', () => {
  const username = 'session-test-student';
  const password = 'session-test-password';
  let validCookie: string[];

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 10);
    const klass = await prisma.class.create({ data: { name: 'session-test-class' } });
    await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: 'STUDENT',
        nameEn: 'Session Test',
        student: { create: { studentId: 'session-test-001', classId: klass.id } },
      },
    });

    const loginRes = await request(app).post('/api/auth/login').send({ username, password });
    validCookie = loginRes.headers['set-cookie'];
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { username } } });
    await prisma.student.deleteMany({ where: { studentId: 'session-test-001' } });
    await prisma.user.deleteMany({ where: { username } });
    await prisma.class.deleteMany({ where: { name: 'session-test-class' } });
  });

  it('accepts a request with a valid session cookie', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', validCookie);
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(username);
  });

  it('rejects a request with no session cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a tampered session cookie', async () => {
    const tampered = tamperCookie(validCookie[0]);
    const res = await request(app).get('/api/auth/me').set('Cookie', [tampered]);
    expect(res.status).toBe(401);
  });

  it('rejects an expired session', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ username, password });
    const freshCookie = loginRes.headers['set-cookie'];

    const session = await prisma.session.findFirst({
      where: { user: { username } },
      orderBy: { createdAt: 'desc' },
    });
    if (!session) throw new Error('expected a session row to exist after login');
    await prisma.session.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app).get('/api/auth/me').set('Cookie', freshCookie);
    expect(res.status).toBe(401);
  });
});
