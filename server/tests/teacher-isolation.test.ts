import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  cleanupQuizFixtures,
  createAdmin,
  createTeacher,
  loginAndGetCookie,
  validQuestionsPayload,
  validQuizShellPayload,
} from './helpers/quizFixtures.js';
import { prisma } from '../src/db.js';

const app = createApp();
const PREFIX = 'teacher-iso-';

describe('teacher isolation (FR-007): a teacher cannot see/edit another teacher\'s quiz', () => {
  let teacherACookie: string[];
  let teacherBCookie: string[];
  let adminCookie: string[];
  let classId: string;
  let quizId: string;

  beforeAll(async () => {
    const klass = await prisma.class.create({ data: { name: `${PREFIX}class` } });
    classId = klass.id;

    const teacherA = await createTeacher({ username: `${PREFIX}teacherA@x.test` });
    const teacherB = await createTeacher({ username: `${PREFIX}teacherB@x.test` });
    const admin = await createAdmin({ username: `${PREFIX}admin@x.test` });

    teacherACookie = await loginAndGetCookie(app, teacherA.username);
    teacherBCookie = await loginAndGetCookie(app, teacherB.username);
    adminCookie = await loginAndGetCookie(app, admin.username);

    const createRes = await request(app)
      .post('/api/teacher/quizzes')
      .set('Cookie', teacherACookie)
      .send(validQuizShellPayload({ classIds: [classId] }));
    quizId = createRes.body.quiz.id;

    await request(app)
      .put(`/api/teacher/quizzes/${quizId}/questions`)
      .set('Cookie', teacherACookie)
      .send({ questions: validQuestionsPayload(15) });
  });

  afterAll(async () => {
    await cleanupQuizFixtures([PREFIX], `${PREFIX}class`);
  });

  it('lets teacher A read her own quiz', async () => {
    const res = await request(app).get(`/api/teacher/quizzes/${quizId}`).set('Cookie', teacherACookie);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(quizId);
  });

  it('gives teacher B 404 on GET of teacher A\'s quiz', async () => {
    const res = await request(app).get(`/api/teacher/quizzes/${quizId}`).set('Cookie', teacherBCookie);
    expect(res.status).toBe(404);
  });

  it('gives teacher B 404 on PUT of teacher A\'s quiz shell', async () => {
    const res = await request(app)
      .put(`/api/teacher/quizzes/${quizId}`)
      .set('Cookie', teacherBCookie)
      .send(validQuizShellPayload({ classIds: [classId] }));
    expect(res.status).toBe(404);
  });

  it('gives teacher B 404 on PUT of teacher A\'s questions', async () => {
    const res = await request(app)
      .put(`/api/teacher/quizzes/${quizId}/questions`)
      .set('Cookie', teacherBCookie)
      .send({ questions: validQuestionsPayload(15) });
    expect(res.status).toBe(404);
  });

  it('gives teacher B 404 on publishing teacher A\'s quiz', async () => {
    const res = await request(app).post(`/api/teacher/quizzes/${quizId}/publish`).set('Cookie', teacherBCookie);
    expect(res.status).toBe(404);
  });

  it('excludes teacher A\'s quiz from teacher B\'s quiz list', async () => {
    const res = await request(app).get('/api/teacher/quizzes').set('Cookie', teacherBCookie);
    expect(res.status).toBe(200);
    expect(res.body.quizzes.find((q: { id: string }) => q.id === quizId)).toBeUndefined();
  });

  it('lets admin read teacher A\'s quiz', async () => {
    const res = await request(app).get(`/api/teacher/quizzes/${quizId}`).set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(quizId);
  });

  it('lets admin edit teacher A\'s quiz shell', async () => {
    const res = await request(app)
      .put(`/api/teacher/quizzes/${quizId}`)
      .set('Cookie', adminCookie)
      .send(validQuizShellPayload({ classIds: [classId], title: 'Fixture Quiz (edited by admin)' }));
    expect(res.status).toBe(200);
    expect(res.body.quiz.title).toBe('Fixture Quiz (edited by admin)');
  });

  it('includes teacher A\'s quiz in admin\'s quiz list', async () => {
    const res = await request(app).get('/api/teacher/quizzes').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.quizzes.find((q: { id: string }) => q.id === quizId)).toBeDefined();
  });
});
