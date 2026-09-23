import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  cleanupQuizFixtures,
  createPublishedQuiz,
  createStudent,
  createTeacher,
  loginAndGetCookie,
} from './helpers/quizFixtures.js';
import { prisma } from '../src/db.js';

const app = createApp();
const PREFIX = 'deadline-window-';

describe('deadline window (FR-020): a student can only start a quiz between its open and close time', () => {
  let studentCookie: string[];
  let teacherCookie: string[];
  let classId: string;

  beforeAll(async () => {
    const klass = await prisma.class.create({ data: { name: `${PREFIX}class` } });
    classId = klass.id;

    const teacher = await createTeacher({ username: `${PREFIX}teacher@x.test` });
    teacherCookie = await loginAndGetCookie(app, teacher.username);

    const student = await createStudent(classId, { studentId: `${PREFIX}student-001` });
    studentCookie = await loginAndGetCookie(app, student.username);
  });

  afterAll(async () => {
    await cleanupQuizFixtures([PREFIX], `${PREFIX}class`);
  });

  it('rejects starting a quiz before its open time, and persists no attempt', async () => {
    const quizId = await createPublishedQuiz(app, teacherCookie, {
      classIds: [classId],
      openAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      closeAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
    });

    const res = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    expect(res.status).toBe(409);

    const count = await prisma.attempt.count({ where: { quizId } });
    expect(count).toBe(0);
  });

  it('rejects starting a quiz after its close time, and persists no attempt', async () => {
    const quizId = await createPublishedQuiz(app, teacherCookie, {
      classIds: [classId],
      openAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
      closeAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    });

    const res = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    expect(res.status).toBe(409);

    const count = await prisma.attempt.count({ where: { quizId } });
    expect(count).toBe(0);
  });

  it('allows starting a quiz that is currently open, capping the deadline at time-limit or close, whichever is sooner', async () => {
    const quizId = await createPublishedQuiz(app, teacherCookie, {
      classIds: [classId],
      timeLimitMinutes: 20,
      openAt: new Date(Date.now() - 60_000).toISOString(),
      closeAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    });

    const res = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    expect(res.status).toBe(200);

    // Quiz closes in 5 minutes but the time limit is 20 — deadline must be capped at close (FR-022).
    const deadline = new Date(res.body.deadline).getTime();
    const closeAt = new Date(res.body.deadline);
    expect(deadline).toBeLessThanOrEqual(Date.now() + 6 * 60_000);
    expect(closeAt).toBeInstanceOf(Date);
  });

  it('a quiz not targeting the student\'s class is treated as not found, not as a window violation', async () => {
    const otherClass = await prisma.class.create({ data: { name: `${PREFIX}other-class` } });
    const quizId = await createPublishedQuiz(app, teacherCookie, { classIds: [otherClass.id] });

    const res = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    expect(res.status).toBe(404);

    await prisma.quiz.deleteMany({ where: { id: quizId } });
    await prisma.class.deleteMany({ where: { id: otherClass.id } });
  });
});
