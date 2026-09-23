import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { createAdmin, createTeacher, loginAndGetCookie, validQuizShellPayload } from './helpers/quizFixtures.js';
import { buildCsvBuffer, buildXlsxBuffer } from './helpers/importFixtures.js';

const app = createApp();
const PREFIX = 'import-arabic-';

describe('spreadsheet import: Arabic content survives exactly through both CSV and XLSX', () => {
  let adminCookie: string[];
  let className: string;

  beforeAll(async () => {
    const admin = await createAdmin({ username: `${PREFIX}admin@x.test` });
    adminCookie = await loginAndGetCookie(app, admin.username);
    className = `${PREFIX}class`;
    await prisma.class.create({ data: { name: className } });
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { username: { startsWith: PREFIX } } } });
    await prisma.student.deleteMany({ where: { studentId: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.class.deleteMany({ where: { name: className } });
  });

  const arabicName = 'سارة الحسن أحمد';
  const header = ['student_id', 'name_ar', 'name_en', 'class', 'email'];

  it('preserves Arabic text exactly through a CSV upload', async () => {
    const studentId = `${PREFIX}csv`;
    const buffer = buildCsvBuffer([header, [studentId, arabicName, '', className, '']]);

    const res = await request(app)
      .post('/api/admin/import/students')
      .set('Cookie', adminCookie)
      .attach('file', buffer, 'students.csv');

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);

    const user = await prisma.user.findUnique({ where: { username: studentId } });
    expect(user?.nameAr).toBe(arabicName);
  });

  it('preserves Arabic text exactly through an XLSX upload', async () => {
    const studentId = `${PREFIX}xlsx`;
    const buffer = buildXlsxBuffer([header, [studentId, arabicName, '', className, '']]);

    const res = await request(app)
      .post('/api/admin/import/students')
      .set('Cookie', adminCookie)
      .attach('file', buffer, 'students.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);

    const user = await prisma.user.findUnique({ where: { username: studentId } });
    expect(user?.nameAr).toBe(arabicName);
  });

  it('round-trips Arabic text through quiz-question import (question text and option text)', async () => {
    const teacher = await createTeacher({ username: `${PREFIX}teacher@x.test` });
    const teacherCookie = await loginAndGetCookie(app, teacher.username);
    const quizClassId = (await prisma.class.create({ data: { name: `${PREFIX}quiz-class` } })).id;

    const createRes = await request(app)
      .post('/api/teacher/quizzes')
      .set('Cookie', teacherCookie)
      .send(validQuizShellPayload({ classIds: [quizClassId] }));
    const quizId = createRes.body.quiz.id;

    const questionAr = 'ما ناتج جمع ٢ + ٣؟';
    const rows = [
      ['question_no', 'question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct', 'points'],
      ['1', questionAr, '٤', '٥', '٦', '٧', 'B', '1'],
    ];

    const res = await request(app)
      .post(`/api/teacher/quizzes/${quizId}/questions/import`)
      .set('Cookie', teacherCookie)
      .attach('file', buildXlsxBuffer(rows), 'questions.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.questions[0].text).toBe(questionAr);
    expect(res.body.questions[0].options.map((o: { text: string }) => o.text)).toEqual(['٤', '٥', '٦', '٧']);

    await prisma.question.deleteMany({ where: { quizId } });
    await prisma.quizClass.deleteMany({ where: { quizId } });
    await prisma.quiz.deleteMany({ where: { id: quizId } });
    await prisma.class.deleteMany({ where: { name: `${PREFIX}quiz-class` } });
  });
});
