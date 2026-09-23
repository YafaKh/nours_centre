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
const PREFIX = 'auto-finalize-';

describe('auto-finalize-on-read (FR-025): an expired attempt is finalized the instant it is read', () => {
  let studentCookie: string[];
  let teacherCookie: string[];
  let classId: string;
  let quizId: string;

  beforeAll(async () => {
    const klass = await prisma.class.create({ data: { name: `${PREFIX}class` } });
    classId = klass.id;

    const teacher = await createTeacher({ username: `${PREFIX}teacher@x.test` });
    teacherCookie = await loginAndGetCookie(app, teacher.username);

    const student = await createStudent(classId, { studentId: `${PREFIX}student-001` });
    studentCookie = await loginAndGetCookie(app, student.username);

    quizId = await createPublishedQuiz(app, teacherCookie, { classIds: [classId] });
  });

  afterAll(async () => {
    await cleanupQuizFixtures([PREFIX], `${PREFIX}class`);
  });

  it('finalizes as AUTO with a score on the very next start-or-resume call, with no sweep involved', async () => {
    const start = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    expect(start.status).toBe(200);
    const attemptId = start.body.id;

    // Answer one question correctly-or-not before time runs out — the score should reflect it.
    const q0 = start.body.questions[0];
    await request(app)
      .put(`/api/student/attempts/${attemptId}/answers`)
      .set('Cookie', studentCookie)
      .send({ questionId: q0.id, optionId: q0.options[0].id });

    await setAttemptDeadline(attemptId, new Date(Date.now() - 60_000));

    const reread = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    expect(reread.status).toBe(200);
    expect(reread.body.id).toBe(attemptId);
    expect(reread.body.submittedAt).not.toBeNull();
    expect(reread.body.submissionType).toBe('AUTO');
    expect(typeof reread.body.score).toBe('number');

    const row = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(row.submittedAt).not.toBeNull();
    expect(row.submissionType).toBe('AUTO');
    expect(row.score).not.toBeNull();
  });

  it('also finalizes on the teacher\'s attempt-list read', async () => {
    const student2 = await createStudent(classId, { studentId: `${PREFIX}student-002` });
    const student2Cookie = await loginAndGetCookie(app, student2.username);

    const start = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', student2Cookie);
    const attemptId = start.body.id;
    await setAttemptDeadline(attemptId, new Date(Date.now() - 60_000));

    const results = await request(app).get(`/api/teacher/quizzes/${quizId}/attempts`).set('Cookie', teacherCookie);
    expect(results.status).toBe(200);
    const row = results.body.attempts.find((a: { id: string }) => a.id === attemptId);
    expect(row).toBeDefined();
    expect(row.submittedAt).not.toBeNull();
    expect(row.submissionType).toBe('AUTO');
    expect(typeof row.score).toBe('number');
  });
});
