import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import {
  cleanupQuizFixtures,
  createClass,
  createStudent,
  createTeacher,
  loginAndGetCookie,
  validQuizShellPayload,
} from './helpers/quizFixtures.js';
import { buildCsvBuffer } from './helpers/importFixtures.js';

const app = createApp();
const PREFIX = 'import-questions-';

function questionRow(no: number, correct = 'B') {
  return [String(no), `Question ${no}?`, 'wrong', 'right', 'wrong', 'wrong', correct, '1'];
}

const HEADER = ['question_no', 'question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct', 'points'];

function fifteenValidRows(): string[][] {
  return [HEADER, ...Array.from({ length: 15 }, (_, i) => questionRow(i + 1))];
}

describe('quiz-question import (FR-055): reuses the question/option validator, replaces the full set, respects the lock', () => {
  let teacherCookie: string[];
  let classId: string;

  beforeAll(async () => {
    const teacher = await createTeacher({ username: `${PREFIX}teacher@x.test` });
    teacherCookie = await loginAndGetCookie(app, teacher.username);
    const klass = await createClass(`${PREFIX}class`);
    classId = klass.id;
  });

  afterAll(async () => {
    await cleanupQuizFixtures([PREFIX], `${PREFIX}class`);
  });

  async function createDraftQuiz() {
    const res = await request(app)
      .post('/api/teacher/quizzes')
      .set('Cookie', teacherCookie)
      .send(validQuizShellPayload({ classIds: [classId] }));
    return res.body.quiz.id as string;
  }

  it('rejects a row missing an option', async () => {
    const quizId = await createDraftQuiz();
    const rows = fifteenValidRows();
    rows[1][4] = ''; // blank option_c on question 1

    const res = await request(app)
      .post(`/api/teacher/quizzes/${quizId}/questions/import`)
      .set('Cookie', teacherCookie)
      .attach('file', buildCsvBuffer(rows), 'questions.csv');

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'row1.option_c' })]),
    );
    const count = await prisma.question.count({ where: { quizId } });
    expect(count).toBe(0);
  });

  it('rejects a row whose correct value is outside A-D', async () => {
    const quizId = await createDraftQuiz();
    const rows = fifteenValidRows();
    rows[1][6] = 'E';

    const res = await request(app)
      .post(`/api/teacher/quizzes/${quizId}/questions/import`)
      .set('Cookie', teacherCookie)
      .attach('file', buildCsvBuffer(rows), 'questions.csv');

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'row1.correct', message: expect.stringContaining('A, B, C, D') })]),
    );
  });

  it('a valid file replaces the quiz\'s full question set', async () => {
    const quizId = await createDraftQuiz();

    const first = await request(app)
      .post(`/api/teacher/quizzes/${quizId}/questions/import`)
      .set('Cookie', teacherCookie)
      .attach('file', buildCsvBuffer(fifteenValidRows()), 'questions.csv');
    expect(first.status).toBe(200);
    expect(first.body.questions).toHaveLength(15);
    const firstQuestionIds = first.body.questions.map((q: { id: string }) => q.id);

    // Re-import with a different (shorter) valid set — should fully replace, not merge.
    const rows = [HEADER, ...Array.from({ length: 15 }, (_, i) => questionRow(i + 1, 'A'))];
    rows[0] = HEADER;
    const second = await request(app)
      .post(`/api/teacher/quizzes/${quizId}/questions/import`)
      .set('Cookie', teacherCookie)
      .attach('file', buildCsvBuffer(rows), 'questions.csv');
    expect(second.status).toBe(200);
    expect(second.body.questions).toHaveLength(15);

    const secondQuestionIds = second.body.questions.map((q: { id: string }) => q.id);
    expect(secondQuestionIds.some((id: string) => firstQuestionIds.includes(id))).toBe(false);

    const totalQuestions = await prisma.question.count({ where: { quizId } });
    expect(totalQuestions).toBe(15);

    // The new correct answer ("A") took effect, not the old one ("B").
    const firstQuestion = await prisma.question.findFirst({
      where: { quizId, order: 0 },
      include: { options: true },
    });
    const correctOption = firstQuestion!.options.find((o) => o.isCorrect);
    expect(correctOption?.text).toBe('wrong');
    expect(correctOption?.order).toBe(0);
  });

  it('rejects import into a quiz that already has an attempt, same as manual edits', async () => {
    const quizId = await createDraftQuiz();
    await request(app)
      .post(`/api/teacher/quizzes/${quizId}/questions/import`)
      .set('Cookie', teacherCookie)
      .attach('file', buildCsvBuffer(fifteenValidRows()), 'questions.csv');
    await request(app).post(`/api/teacher/quizzes/${quizId}/publish`).set('Cookie', teacherCookie);

    const student = await createStudent(classId, { studentId: `${PREFIX}locker` });
    const studentCookie = await loginAndGetCookie(app, student.username);
    const startRes = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie);
    expect(startRes.status).toBe(200);

    const res = await request(app)
      .post(`/api/teacher/quizzes/${quizId}/questions/import`)
      .set('Cookie', teacherCookie)
      .attach('file', buildCsvBuffer(fifteenValidRows()), 'questions.csv');

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/locked/i);
  });
});
