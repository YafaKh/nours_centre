import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';

const app = createApp();

describe('auth: login', () => {
  const username = 'auth-test-student';
  const password = 'correct-horse-battery';

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 10);
    const klass = await prisma.class.create({ data: { name: 'auth-test-class' } });
    await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: 'STUDENT',
        nameEn: 'Auth Test',
        student: { create: { studentId: 'auth-test-001', classId: klass.id } },
      },
    });
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { username } } });
    await prisma.student.deleteMany({ where: { studentId: 'auth-test-001' } });
    await prisma.user.deleteMany({ where: { username } });
    await prisma.class.deleteMany({ where: { name: 'auth-test-class' } });
  });

  it('rejects an unknown username', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'nobody', password: 'whatever' });
    expect(res.status).toBe(401);
  });

  it('rejects the wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ username, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('accepts the correct password and sets a session cookie', async () => {
    const res = await request(app).post('/api/auth/login').send({ username, password });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(username);
    expect(res.body.user.role).toBe('STUDENT');
    expect(res.headers['set-cookie']?.[0]).toMatch(/^sid=/);
  });

  it('rate-limits repeated failed logins from the same client', async () => {
    // Enough attempts to exceed the configured limit regardless of how many
    // requests this describe block has already sent to /api/auth/login.
    let lastStatus = 0;
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/api/auth/login').send({ username, password: 'wrong-password' });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
