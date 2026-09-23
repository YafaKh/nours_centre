import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { sweepExpiredAttempts } from '../src/quiz/finalize.js';
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
const PREFIX = 'sweep-';

describe('sweep-job (PLAN.md decision #1): the sweep finalizes expired attempts with zero client requests', () => {
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

  it('finalizes an expired, unsubmitted attempt when called directly, untouched by any HTTP request', async () => {
    const student = await createStudent(classId, { studentId: `${PREFIX}student-001` });
    const studentCookie = await loginAndGetCookie(app, student.username);

    const start = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    const attemptId = start.body.id;
    await setAttemptDeadline(attemptId, new Date(Date.now() - 60_000));

    // No further HTTP request touches this attempt — only the sweep function itself.
    const finalizedCount = await sweepExpiredAttempts();
    expect(finalizedCount).toBeGreaterThanOrEqual(1);

    const row = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(row.submittedAt).not.toBeNull();
    expect(row.submissionType).toBe('AUTO');
    expect(row.score).not.toBeNull();
  });

  it('leaves an attempt that is still within its deadline untouched', async () => {
    const student = await createStudent(classId, { studentId: `${PREFIX}student-002` });
    const studentCookie = await loginAndGetCookie(app, student.username);

    const start = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    const attemptId = start.body.id;

    await sweepExpiredAttempts();

    const row = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(row.submittedAt).toBeNull();
  });

  it('does not touch an attempt already submitted manually before its deadline', async () => {
    const student = await createStudent(classId, { studentId: `${PREFIX}student-003` });
    const studentCookie = await loginAndGetCookie(app, student.username);

    const start = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    const attemptId = start.body.id;

    const submit = await request(app).post(`/api/student/attempts/${attemptId}/submit`).set('Cookie', studentCookie);
    expect(submit.status).toBe(200);
    expect(submit.body.submissionType).toBe('MANUAL');

    await sweepExpiredAttempts();

    const row = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(row.submissionType).toBe('MANUAL');
  });
});
