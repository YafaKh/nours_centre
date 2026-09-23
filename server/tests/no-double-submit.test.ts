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
const PREFIX = 'no-double-submit-';

describe('no-double-submit (FR-027-adjacent): resubmitting a finalized attempt is rejected', () => {
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

  it('rejects a second manual submit after a successful manual submit, with the score unchanged', async () => {
    const student = await createStudent(classId, { studentId: `${PREFIX}student-001` });
    const studentCookie = await loginAndGetCookie(app, student.username);

    const start = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    const attemptId = start.body.id;
    const q0 = start.body.questions[0];
    await request(app)
      .put(`/api/student/attempts/${attemptId}/answers`)
      .set('Cookie', studentCookie)
      .send({ questionId: q0.id, optionId: q0.options[0].id });

    const first = await request(app).post(`/api/student/attempts/${attemptId}/submit`).set('Cookie', studentCookie);
    expect(first.status).toBe(200);
    const firstScore = first.body.score;

    const second = await request(app).post(`/api/student/attempts/${attemptId}/submit`).set('Cookie', studentCookie);
    expect(second.status).toBe(409);

    const row = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(row.submissionType).toBe('MANUAL');
    expect(row.score).toBe(firstScore);
  });

  it('rejects a manual submit after the attempt has already been auto-finalized', async () => {
    const student = await createStudent(classId, { studentId: `${PREFIX}student-002` });
    const studentCookie = await loginAndGetCookie(app, student.username);

    const start = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    const attemptId = start.body.id;
    await setAttemptDeadline(attemptId, new Date(Date.now() - 60_000));

    // Auto-finalizes lazily on this read.
    await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);

    const submit = await request(app).post(`/api/student/attempts/${attemptId}/submit`).set('Cookie', studentCookie);
    expect(submit.status).toBe(409);

    const row = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(row.submissionType).toBe('AUTO');
  });

  it('rejects an answer write against an already-submitted attempt', async () => {
    const student = await createStudent(classId, { studentId: `${PREFIX}student-003` });
    const studentCookie = await loginAndGetCookie(app, student.username);

    const start = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    const attemptId = start.body.id;
    const q0 = start.body.questions[0];

    await request(app).post(`/api/student/attempts/${attemptId}/submit`).set('Cookie', studentCookie);

    const res = await request(app)
      .put(`/api/student/attempts/${attemptId}/answers`)
      .set('Cookie', studentCookie)
      .send({ questionId: q0.id, optionId: q0.options[0].id });
    expect(res.status).toBe(409);
  });
});
