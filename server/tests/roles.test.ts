import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';

const app = createApp();

async function loginAndGetCookie(username: string, password: string): Promise<string[]> {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  const cookie = res.headers['set-cookie'];
  if (!cookie) {
    throw new Error(`login failed for ${username}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return cookie;
}

describe('role-based access control', () => {
  const password = 'roles-test-password';
  let studentCookie: string[];
  let teacherCookie: string[];
  let adminCookie: string[];

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 10);
    const klass = await prisma.class.create({ data: { name: 'roles-test-class' } });

    await prisma.user.create({
      data: {
        username: 'roles-test-student',
        passwordHash,
        role: 'STUDENT',
        nameEn: 'RT Student',
        student: { create: { studentId: 'roles-test-001', classId: klass.id } },
      },
    });
    await prisma.user.create({
      data: {
        username: 'roles-test-teacher',
        passwordHash,
        role: 'TEACHER',
        nameEn: 'RT Teacher',
        teacher: { create: { email: 'roles-test-teacher@x.test' } },
      },
    });
    await prisma.user.create({
      data: {
        username: 'roles-test-admin',
        passwordHash,
        role: 'ADMIN',
        nameEn: 'RT Admin',
      },
    });

    studentCookie = await loginAndGetCookie('roles-test-student', password);
    teacherCookie = await loginAndGetCookie('roles-test-teacher', password);
    adminCookie = await loginAndGetCookie('roles-test-admin', password);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { username: { startsWith: 'roles-test-' } } } });
    await prisma.student.deleteMany({ where: { studentId: 'roles-test-001' } });
    await prisma.teacher.deleteMany({ where: { email: 'roles-test-teacher@x.test' } });
    await prisma.user.deleteMany({ where: { username: { startsWith: 'roles-test-' } } });
    await prisma.class.deleteMany({ where: { name: 'roles-test-class' } });
  });

  it('blocks a student from /api/teacher/* with 403', async () => {
    const res = await request(app).get('/api/teacher/dashboard').set('Cookie', studentCookie);
    expect(res.status).toBe(403);
  });

  it('blocks a student from /api/admin/* with 403', async () => {
    const res = await request(app).get('/api/admin/dashboard').set('Cookie', studentCookie);
    expect(res.status).toBe(403);
  });

  it('blocks a teacher from /api/admin/* with 403', async () => {
    const res = await request(app).get('/api/admin/dashboard').set('Cookie', teacherCookie);
    expect(res.status).toBe(403);
  });

  it('allows a teacher into /api/teacher/*', async () => {
    const res = await request(app).get('/api/teacher/dashboard').set('Cookie', teacherCookie);
    expect(res.status).toBe(200);
  });

  it('allows a student into /api/student/*', async () => {
    const res = await request(app).get('/api/student/dashboard').set('Cookie', studentCookie);
    expect(res.status).toBe(200);
  });

  it('allows admin into both /api/teacher/* and /api/admin/*', async () => {
    const teacherRes = await request(app).get('/api/teacher/dashboard').set('Cookie', adminCookie);
    const adminRes = await request(app).get('/api/admin/dashboard').set('Cookie', adminCookie);
    expect(teacherRes.status).toBe(200);
    expect(adminRes.status).toBe(200);
  });

  it('blocks unauthenticated requests from every role-scoped route', async () => {
    const student = await request(app).get('/api/student/dashboard');
    const teacher = await request(app).get('/api/teacher/dashboard');
    const admin = await request(app).get('/api/admin/dashboard');
    expect(student.status).toBe(401);
    expect(teacher.status).toBe(401);
    expect(admin.status).toBe(401);
  });
});
