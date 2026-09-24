import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import {
  cleanupQuizFixtures,
  createPublishedQuiz,
  createStudent,
  createTeacher,
  loginAndGetCookie,
  setAttemptDeadline,
} from './helpers/quizFixtures.js';

const app = createApp();
const PREFIX = 'post-submit-access-';

// SPEC.md §4.3/§4.4 decision: a student cannot reopen a quiz to see its questions again once
// their attempt is submitted (manually or automatically) or the quiz has closed — only score and
// status remain visible, from the quiz list.
describe('post-submit access: a submitted attempt can no longer be reopened to review its questions', () => {
  let classId: string;
  let quizId: string;

  beforeAll(async () => {
    const klass = await prisma.class.create({ data: { name: `${PREFIX}class` } });
    classId = klass.id;

    const teacher = await createTeacher({ username: `${PREFIX}teacher@x.test` });
    const teacherCookie = await loginAndGetCookie(app, teacher.username);

    quizId = await createPublishedQuiz(app, teacherCookie, { classIds: [classId] });
  });

  afterAll(async () => {
    await cleanupQuizFixtures([PREFIX], `${PREFIX}class`);
  });

  it('drops question/answer content from the submit response itself, keeping only score and status', async () => {
    const student = await createStudent(classId, { studentId: `${PREFIX}manual` });
    const studentCookie = await loginAndGetCookie(app, student.username);

    const start = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    expect(start.body.questions.length).toBe(15);
    const q0 = start.body.questions[0];
    await request(app)
      .put(`/api/student/attempts/${start.body.id}/answers`)
      .set('Cookie', studentCookie)
      .send({ questionId: q0.id, optionId: q0.options[0].id });

    const submitRes = await request(app)
      .post(`/api/student/attempts/${start.body.id}/submit`)
      .set('Cookie', studentCookie);
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.questions).toEqual([]);
    expect(submitRes.body.answers).toEqual({});
    expect(typeof submitRes.body.score).toBe('number');
    expect(submitRes.body.submittedAt).not.toBeNull();
  });

  it('keeps returning empty questions/answers on every later reopen attempt after a manual submit', async () => {
    const student = await createStudent(classId, { studentId: `${PREFIX}reopen` });
    const studentCookie = await loginAndGetCookie(app, student.username);

    const start = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    await request(app).post(`/api/student/attempts/${start.body.id}/submit`).set('Cookie', studentCookie);

    const reopen = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    expect(reopen.status).toBe(200);
    expect(reopen.body.id).toBe(start.body.id);
    expect(reopen.body.questions).toEqual([]);
    expect(reopen.body.answers).toEqual({});
    expect(typeof reopen.body.score).toBe('number');
    expect(reopen.body.submittedAt).not.toBeNull();
  });

  it('drops question/answer content once an attempt auto-finalizes past its deadline', async () => {
    const student = await createStudent(classId, { studentId: `${PREFIX}auto` });
    const studentCookie = await loginAndGetCookie(app, student.username);

    const start = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    expect(start.body.questions.length).toBe(15);

    await setAttemptDeadline(start.body.id, new Date(Date.now() - 60_000));

    const reread = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    expect(reread.status).toBe(200);
    expect(reread.body.submissionType).toBe('AUTO');
    expect(reread.body.questions).toEqual([]);
    expect(reread.body.answers).toEqual({});
  });

  it('includes a maxScore alongside each quiz on the student dashboard list', async () => {
    const student = await createStudent(classId, { studentId: `${PREFIX}list` });
    const studentCookie = await loginAndGetCookie(app, student.username);

    const list = await request(app).get('/api/student/quizzes').set('Cookie', studentCookie);
    expect(list.status).toBe(200);
    const quiz = list.body.quizzes.find((q: { id: string }) => q.id === quizId);
    expect(quiz).toBeDefined();
    expect(quiz.maxScore).toBe(60); // 15 fixture questions * 4 points each
  });
});
