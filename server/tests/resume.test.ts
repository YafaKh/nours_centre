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
const PREFIX = 'resume-';

describe('resume (FR-024): reloading returns the same attempt, deadline, and saved answers', () => {
  let studentCookie: string[];
  let classId: string;
  let quizId: string;

  beforeAll(async () => {
    const klass = await prisma.class.create({ data: { name: `${PREFIX}class` } });
    classId = klass.id;

    const teacher = await createTeacher({ username: `${PREFIX}teacher@x.test` });
    const teacherCookie = await loginAndGetCookie(app, teacher.username);

    const student = await createStudent(classId, { studentId: `${PREFIX}student-001` });
    studentCookie = await loginAndGetCookie(app, student.username);

    quizId = await createPublishedQuiz(app, teacherCookie, { classIds: [classId] });
  });

  afterAll(async () => {
    await cleanupQuizFixtures([PREFIX], `${PREFIX}class`);
  });

  it('returns the same attempt id and deadline, with prior answers, on a second (reload) call', async () => {
    const first = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    expect(first.status).toBe(200);
    const attemptId = first.body.id;
    const deadline = first.body.deadline;
    const q0 = first.body.questions[0];
    const q1 = first.body.questions[1];
    const chosen0 = q0.options[0].id;
    const chosen1 = q1.options[1].id;

    const answer0 = await request(app)
      .put(`/api/student/attempts/${attemptId}/answers`)
      .set('Cookie', studentCookie)
      .send({ questionId: q0.id, optionId: chosen0 });
    expect(answer0.status).toBe(200);

    const answer1 = await request(app)
      .put(`/api/student/attempts/${attemptId}/answers`)
      .set('Cookie', studentCookie)
      .send({ questionId: q1.id, optionId: chosen1 });
    expect(answer1.status).toBe(200);

    // Simulates a page refresh: same call as starting, now that an attempt already exists.
    const second = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(attemptId);
    expect(second.body.deadline).toBe(deadline);
    expect(second.body.answers[q0.id]).toBe(chosen0);
    expect(second.body.answers[q1.id]).toBe(chosen1);
  });

  it('lets a later answer replace an earlier one for the same question, without creating a second row', async () => {
    const start = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    const q = start.body.questions[2];

    await request(app)
      .put(`/api/student/attempts/${start.body.id}/answers`)
      .set('Cookie', studentCookie)
      .send({ questionId: q.id, optionId: q.options[0].id });
    await request(app)
      .put(`/api/student/attempts/${start.body.id}/answers`)
      .set('Cookie', studentCookie)
      .send({ questionId: q.id, optionId: q.options[2].id });

    const reread = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    expect(reread.body.answers[q.id]).toBe(q.options[2].id);

    const rowCount = await prisma.answer.count({ where: { attemptId: start.body.id, questionId: q.id } });
    expect(rowCount).toBe(1);
  });

  it('rejects an answer for a question that does not belong to the attempt\'s quiz', async () => {
    const otherClass = await prisma.class.create({ data: { name: `${PREFIX}other-class` } });
    const teacher = await createTeacher({ username: `${PREFIX}teacher2@x.test` });
    const teacherCookie = await loginAndGetCookie(app, teacher.username);
    const otherQuizId = await createPublishedQuiz(app, teacherCookie, { classIds: [otherClass.id] });
    const otherQuiz = await prisma.quiz.findUniqueOrThrow({
      where: { id: otherQuizId },
      include: { questions: true },
    });

    const start = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);

    const res = await request(app)
      .put(`/api/student/attempts/${start.body.id}/answers`)
      .set('Cookie', studentCookie)
      .send({ questionId: otherQuiz.questions[0].id, optionId: start.body.questions[0].options[0].id });
    expect(res.status).toBe(400);

    await prisma.quiz.deleteMany({ where: { id: otherQuizId } });
    await prisma.class.deleteMany({ where: { id: otherClass.id } });
    await prisma.session.deleteMany({ where: { user: { username: teacher.username } } });
    await prisma.teacher.deleteMany({ where: { email: teacher.username } });
    await prisma.user.deleteMany({ where: { id: teacher.id } });
  });
});
