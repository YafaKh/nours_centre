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
const PREFIX = 'grace-';

describe('grace-period (FR-026): a 10s grace period covers network delay past the deadline', () => {
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

  it('accepts an answer submitted a few seconds past the deadline, inside the grace period', async () => {
    const student = await createStudent(classId, { studentId: `${PREFIX}student-001` });
    const studentCookie = await loginAndGetCookie(app, student.username);

    const start = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    const attemptId = start.body.id;
    const q0 = start.body.questions[0];
    // 5s past the deadline — well inside the 10s grace period.
    await setAttemptDeadline(attemptId, new Date(Date.now() - 5_000));

    const res = await request(app)
      .put(`/api/student/attempts/${attemptId}/answers`)
      .set('Cookie', studentCookie)
      .send({ questionId: q0.id, optionId: q0.options[0].id });
    expect(res.status).toBe(200);

    const row = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(row.submittedAt).toBeNull();
  });

  it('rejects an answer submitted past the grace period', async () => {
    const student = await createStudent(classId, { studentId: `${PREFIX}student-002` });
    const studentCookie = await loginAndGetCookie(app, student.username);

    const start = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    const attemptId = start.body.id;
    const q0 = start.body.questions[0];
    // 15s past the deadline — outside the 10s grace period.
    await setAttemptDeadline(attemptId, new Date(Date.now() - 15_000));

    const res = await request(app)
      .put(`/api/student/attempts/${attemptId}/answers`)
      .set('Cookie', studentCookie)
      .send({ questionId: q0.id, optionId: q0.options[0].id });
    expect(res.status).toBe(409);

    const row = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(row.submittedAt).not.toBeNull();
    expect(row.submissionType).toBe('AUTO');
  });
});
