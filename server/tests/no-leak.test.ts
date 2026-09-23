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
const PREFIX = 'no-leak-';

describe('no leak (FR-028): quiz-taking payload never includes correctness data pre-submission', () => {
  let studentACookie: string[];
  let studentBCookie: string[];
  let classId: string;
  let quizId: string;

  beforeAll(async () => {
    const klass = await prisma.class.create({ data: { name: `${PREFIX}class` } });
    classId = klass.id;

    const teacher = await createTeacher({ username: `${PREFIX}teacher@x.test` });
    const teacherCookie = await loginAndGetCookie(app, teacher.username);

    const studentA = await createStudent(classId, { studentId: `${PREFIX}student-A` });
    const studentB = await createStudent(classId, { studentId: `${PREFIX}student-B` });
    studentACookie = await loginAndGetCookie(app, studentA.username);
    studentBCookie = await loginAndGetCookie(app, studentB.username);

    quizId = await createPublishedQuiz(app, teacherCookie, { classIds: [classId] });
  });

  afterAll(async () => {
    await cleanupQuizFixtures([PREFIX], `${PREFIX}class`);
  });

  it('excludes isCorrect from every option in the start-attempt response', async () => {
    const res = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentACookie);
    expect(res.status).toBe(200);

    expect(JSON.stringify(res.body)).not.toContain('isCorrect');
    expect(res.body.questions.length).toBeGreaterThan(0);
    for (const q of res.body.questions) {
      expect(q.options.length).toBe(4);
      for (const o of q.options) {
        expect(o).not.toHaveProperty('isCorrect');
      }
    }
  });

  it('excludes isCorrect from every option after answers have been saved', async () => {
    const start = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentACookie);
    const q0 = start.body.questions[0];
    await request(app)
      .put(`/api/student/attempts/${start.body.id}/answers`)
      .set('Cookie', studentACookie)
      .send({ questionId: q0.id, optionId: q0.options[0].id });

    const again = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentACookie);
    expect(JSON.stringify(again.body)).not.toContain('isCorrect');
  });

  it('gives student B 404 when trying to read or answer on student A\'s attempt', async () => {
    const startA = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentACookie);
    const attemptId = startA.body.id;
    const q0 = startA.body.questions[0];

    const answerRes = await request(app)
      .put(`/api/student/attempts/${attemptId}/answers`)
      .set('Cookie', studentBCookie)
      .send({ questionId: q0.id, optionId: q0.options[0].id });
    expect(answerRes.status).toBe(404);
  });
});
