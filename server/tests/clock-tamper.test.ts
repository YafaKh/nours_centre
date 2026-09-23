import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  cleanupQuizFixtures,
  createPublishedQuiz,
  createStudent,
  createTeacher,
  loginAndGetCookie,
  setAttemptDeadline,
} from './helpers/quizFixtures.js';
import { prisma } from '../src/db.js';

const app = createApp();
const PREFIX = 'clock-tamper-';

describe('clock-tamper (SC-003): a spoofed client timestamp never changes whether an attempt is late', () => {
  let classId: string;
  let teacherCookie: string[];
  let quizId: string;

  beforeAll(async () => {
    const klass = await prisma.class.create({ data: { name: `${PREFIX}class` } });
    classId = klass.id;

    const teacher = await createTeacher({ username: `${PREFIX}teacher@x.test` });
    teacherCookie = await loginAndGetCookie(app, teacher.username);

    quizId = await createPublishedQuiz(app, teacherCookie, { classIds: [classId] });
  });

  afterAll(async () => {
    await cleanupQuizFixtures([PREFIX], `${PREFIX}class`);
  });

  it('rejects an answer on an expired attempt even when the request claims an earlier "now"', async () => {
    const student = await createStudent(classId, { studentId: `${PREFIX}student-001` });
    const studentCookie = await loginAndGetCookie(app, student.username);

    const start = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    const attemptId = start.body.id;
    const q0 = start.body.questions[0];
    await setAttemptDeadline(attemptId, new Date(Date.now() - 60_000));

    const res = await request(app)
      .put(`/api/student/attempts/${attemptId}/answers`)
      .set('Cookie', studentCookie)
      .send({
        questionId: q0.id,
        optionId: q0.options[0].id,
        // A spoofed client clock claiming the attempt still has time left — must be ignored.
        now: new Date(Date.now() + 60 * 60_000).toISOString(),
        clientTime: new Date(Date.now() - 5 * 60 * 60_000).toISOString(),
      });
    expect(res.status).toBe(409);

    const answerCount = await prisma.answer.count({ where: { attemptId, questionId: q0.id } });
    expect(answerCount).toBe(0);

    const row = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(row.submissionType).toBe('AUTO');
  });

  it('finalizes a late manual submit as AUTO (not MANUAL) regardless of a spoofed on-time timestamp', async () => {
    const student = await createStudent(classId, { studentId: `${PREFIX}student-002` });
    const studentCookie = await loginAndGetCookie(app, student.username);

    const start = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    const attemptId = start.body.id;
    await setAttemptDeadline(attemptId, new Date(Date.now() - 60_000));

    const res = await request(app)
      .post(`/api/student/attempts/${attemptId}/submit`)
      .set('Cookie', studentCookie)
      .send({ now: new Date().toISOString() });

    expect(res.status).toBe(200);
    expect(res.body.submissionType).toBe('AUTO');
  });
});
