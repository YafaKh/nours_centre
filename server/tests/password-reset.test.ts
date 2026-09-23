import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { createAdmin, createClass, createStudent, loginAndGetCookie } from './helpers/quizFixtures.js';

const app = createApp();
const PREFIX = 'password-reset-';

describe('admin password reset (FR-054/A4): invalidates the student\'s existing session immediately, and the new password logs in', () => {
  let adminCookie: string[];
  let classId: string;

  beforeAll(async () => {
    const admin = await createAdmin({ username: `${PREFIX}admin@x.test` });
    adminCookie = await loginAndGetCookie(app, admin.username);
    classId = (await createClass(`${PREFIX}class`)).id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { username: { startsWith: PREFIX } } } });
    await prisma.student.deleteMany({ where: { studentId: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.class.deleteMany({ where: { name: `${PREFIX}class` } });
  });

  it('resets the password, kills the old session, and the new password works', async () => {
    const studentId = `${PREFIX}s1`;
    const student = await createStudent(classId, { studentId });
    const studentCookie = await loginAndGetCookie(app, student.username);

    // The old session works before the reset.
    const beforeReset = await request(app).get('/api/student/dashboard').set('Cookie', studentCookie);
    expect(beforeReset.status).toBe(200);

    const studentRow = await prisma.student.findUniqueOrThrow({ where: { studentId } });
    const resetRes = await request(app)
      .post(`/api/admin/students/${studentRow.id}/reset-password`)
      .set('Cookie', adminCookie);
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.studentId).toBe(studentId);
    const newPassword: string = resetRes.body.password;
    expect(newPassword).toBeTruthy();

    // The old session cookie is rejected on the very next request.
    const afterReset = await request(app).get('/api/student/dashboard').set('Cookie', studentCookie);
    expect(afterReset.status).toBe(401);

    // The old password no longer works either.
    const oldPasswordLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: studentId, password: 'quiz-fixture-password' });
    expect(oldPasswordLogin.status).toBe(401);

    // The new password logs in successfully.
    const newLogin = await request(app).post('/api/auth/login').send({ username: studentId, password: newPassword });
    expect(newLogin.status).toBe(200);
    const newCookie = newLogin.headers['set-cookie'];
    const dashboardWithNewCookie = await request(app).get('/api/student/dashboard').set('Cookie', newCookie);
    expect(dashboardWithNewCookie.status).toBe(200);
  });

  it('returns 404 for a student id that does not exist', async () => {
    const res = await request(app).post('/api/admin/students/does-not-exist/reset-password').set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });
});
