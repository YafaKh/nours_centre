import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  cleanupQuizFixtures,
  createStudent,
  createTeacher,
  loginAndGetCookie,
  validQuestionsPayload,
  validQuizShellPayload,
} from './helpers/quizFixtures.js';
import { prisma } from '../src/db.js';

const app = createApp();
const PREFIX = 'lock-rule-';

describe('lock rule (FR-014): once an attempt exists, the quiz is fully locked, no exceptions', () => {
  let teacherCookie: string[];
  let classId: string;
  let quizId: string;

  beforeAll(async () => {
    const klass = await prisma.class.create({ data: { name: `${PREFIX}class` } });
    classId = klass.id;

    const teacher = await createTeacher({ username: `${PREFIX}teacher@x.test` });
    teacherCookie = await loginAndGetCookie(app, teacher.username);

    const createRes = await request(app)
      .post('/api/teacher/quizzes')
      .set('Cookie', teacherCookie)
      .send(validQuizShellPayload({ classIds: [classId] }));
    quizId = createRes.body.quiz.id;

    await request(app)
      .put(`/api/teacher/quizzes/${quizId}/questions`)
      .set('Cookie', teacherCookie)
      .send({ questions: validQuestionsPayload(15) });

    await request(app).post(`/api/teacher/quizzes/${quizId}/publish`).set('Cookie', teacherCookie);
  });

  afterAll(async () => {
    await cleanupQuizFixtures([PREFIX], `${PREFIX}class`);
  });

  it('allows edits before any attempt exists (control)', async () => {
    const shellRes = await request(app)
      .put(`/api/teacher/quizzes/${quizId}`)
      .set('Cookie', teacherCookie)
      .send(validQuizShellPayload({ classIds: [classId], title: 'Fixture Quiz (still unlocked)' }));
    expect(shellRes.status).toBe(200);

    const questionsRes = await request(app)
      .put(`/api/teacher/quizzes/${quizId}/questions`)
      .set('Cookie', teacherCookie)
      .send({ questions: validQuestionsPayload(15) });
    expect(questionsRes.status).toBe(200);
  });

  it('locks the quiz the instant a student attempt row exists', async () => {
    const student = await createStudent(classId, { studentId: `${PREFIX}student-001` });
    if (!student.student) throw new Error('expected student relation to be created');

    await prisma.attempt.create({
      data: {
        studentId: student.student.id,
        quizId,
        deadline: new Date(Date.now() + 10 * 60_000),
      },
    });

    const shellRes = await request(app)
      .put(`/api/teacher/quizzes/${quizId}`)
      .set('Cookie', teacherCookie)
      .send(validQuizShellPayload({ classIds: [classId], title: 'Fixture Quiz (attempted edit after lock)' }));
    expect(shellRes.status).toBe(409);

    const closeDateOnlyRes = await request(app)
      .put(`/api/teacher/quizzes/${quizId}`)
      .set('Cookie', teacherCookie)
      .send(validQuizShellPayload({ classIds: [classId], closeAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString() }));
    expect(closeDateOnlyRes.status).toBe(409);

    const questionsRes = await request(app)
      .put(`/api/teacher/quizzes/${quizId}/questions`)
      .set('Cookie', teacherCookie)
      .send({ questions: validQuestionsPayload(15) });
    expect(questionsRes.status).toBe(409);
  });

  it('still allows reading the locked quiz, flagged as locked', async () => {
    const res = await request(app).get(`/api/teacher/quizzes/${quizId}`).set('Cookie', teacherCookie);
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(true);
  });
});
