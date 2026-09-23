import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  cleanupQuizFixtures,
  createTeacher,
  loginAndGetCookie,
  validQuestionsPayload,
  validQuizShellPayload,
} from './helpers/quizFixtures.js';
import { prisma } from '../src/db.js';

const app = createApp();
const PREFIX = 'quiz-crud-';

describe('quiz authoring: create/edit validation (FR-010, FR-011)', () => {
  let teacherCookie: string[];
  let classId: string;

  beforeAll(async () => {
    const klass = await prisma.class.create({ data: { name: `${PREFIX}class` } });
    classId = klass.id;
    const teacher = await createTeacher({ username: `${PREFIX}teacher@x.test` });
    teacherCookie = await loginAndGetCookie(app, teacher.username);
  });

  afterAll(async () => {
    await cleanupQuizFixtures([PREFIX], `${PREFIX}class`);
  });

  it('rejects a quiz shell missing a title', async () => {
    const res = await request(app)
      .post('/api/teacher/quizzes')
      .set('Cookie', teacherCookie)
      .send(validQuizShellPayload({ classIds: [classId], title: '' }));
    expect(res.status).toBe(400);
    expect(res.body.details.some((e: { field: string }) => e.field === 'title')).toBe(true);
  });

  it('rejects a quiz shell with no target classes', async () => {
    const res = await request(app)
      .post('/api/teacher/quizzes')
      .set('Cookie', teacherCookie)
      .send(validQuizShellPayload({ classIds: [] }));
    expect(res.status).toBe(400);
    expect(res.body.details.some((e: { field: string }) => e.field === 'classIds')).toBe(true);
  });

  it('rejects a quiz shell whose close time is before its open time', async () => {
    const now = Date.now();
    const res = await request(app)
      .post('/api/teacher/quizzes')
      .set('Cookie', teacherCookie)
      .send(
        validQuizShellPayload({
          classIds: [classId],
          openAt: new Date(now).toISOString(),
          closeAt: new Date(now - 60_000).toISOString(),
        }),
      );
    expect(res.status).toBe(400);
    expect(res.body.details.some((e: { field: string }) => e.field === 'closeAt')).toBe(true);
  });

  it('rejects negative marking turned on without a valid penalty fraction', async () => {
    const res = await request(app)
      .post('/api/teacher/quizzes')
      .set('Cookie', teacherCookie)
      .send(validQuizShellPayload({ classIds: [classId], negativeMarking: true, penaltyFraction: 0 }));
    expect(res.status).toBe(400);
    expect(res.body.details.some((e: { field: string }) => e.field === 'penaltyFraction')).toBe(true);
  });

  it('creates a valid quiz shell as a draft', async () => {
    const res = await request(app)
      .post('/api/teacher/quizzes')
      .set('Cookie', teacherCookie)
      .send(validQuizShellPayload({ classIds: [classId] }));
    expect(res.status).toBe(201);
    expect(res.body.quiz.status).toBe('DRAFT');
    expect(res.body.quiz.classes).toHaveLength(1);
  });

  describe('question set validation', () => {
    let quizId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/teacher/quizzes')
        .set('Cookie', teacherCookie)
        .send(validQuizShellPayload({ classIds: [classId] }));
      quizId = res.body.quiz.id;
    });

    it('rejects a question with only three options', async () => {
      const questions = validQuestionsPayload(1);
      questions[0].options = questions[0].options.slice(0, 3);
      const res = await request(app)
        .put(`/api/teacher/quizzes/${quizId}/questions`)
        .set('Cookie', teacherCookie)
        .send({ questions });
      expect(res.status).toBe(400);
      expect(res.body.details.some((e: { message: string }) => e.message.includes('exactly four options'))).toBe(true);
    });

    it('rejects a question with two correct options', async () => {
      const questions = validQuestionsPayload(1);
      questions[0].options[1].isCorrect = true; // now two options marked correct
      const res = await request(app)
        .put(`/api/teacher/quizzes/${quizId}/questions`)
        .set('Cookie', teacherCookie)
        .send({ questions });
      expect(res.status).toBe(400);
      expect(res.body.details.some((e: { message: string }) => e.message.includes('exactly one option'))).toBe(true);
    });

    it('rejects a question with zero correct options', async () => {
      const questions = validQuestionsPayload(1);
      questions[0].options = questions[0].options.map((o) => ({ ...o, isCorrect: false }));
      const res = await request(app)
        .put(`/api/teacher/quizzes/${quizId}/questions`)
        .set('Cookie', teacherCookie)
        .send({ questions });
      expect(res.status).toBe(400);
      expect(res.body.details.some((e: { message: string }) => e.message.includes('exactly one option'))).toBe(true);
    });

    it('rejects a question missing required text', async () => {
      const questions = validQuestionsPayload(1);
      questions[0].text = '';
      const res = await request(app)
        .put(`/api/teacher/quizzes/${quizId}/questions`)
        .set('Cookie', teacherCookie)
        .send({ questions });
      expect(res.status).toBe(400);
      expect(res.body.details.some((e: { field: string }) => e.field.endsWith('.text'))).toBe(true);
    });

    it('accepts a valid 15-question, 4-option set and publishes', async () => {
      const questions = validQuestionsPayload(15);
      const putRes = await request(app)
        .put(`/api/teacher/quizzes/${quizId}/questions`)
        .set('Cookie', teacherCookie)
        .send({ questions });
      expect(putRes.status).toBe(200);
      expect(putRes.body.questions).toHaveLength(15);
      for (const q of putRes.body.questions) {
        expect(q.options).toHaveLength(4);
        expect(q.options.filter((o: { isCorrect: boolean }) => o.isCorrect)).toHaveLength(1);
      }

      const publishRes = await request(app)
        .post(`/api/teacher/quizzes/${quizId}/publish`)
        .set('Cookie', teacherCookie);
      expect(publishRes.status).toBe(200);
      expect(publishRes.body.quiz.status).toBe('PUBLISHED');
    });
  });

  it('rejects publishing a quiz with no questions', async () => {
    const createRes = await request(app)
      .post('/api/teacher/quizzes')
      .set('Cookie', teacherCookie)
      .send(validQuizShellPayload({ classIds: [classId] }));
    const publishRes = await request(app)
      .post(`/api/teacher/quizzes/${createRes.body.quiz.id}/publish`)
      .set('Cookie', teacherCookie);
    expect(publishRes.status).toBe(400);
  });
});
