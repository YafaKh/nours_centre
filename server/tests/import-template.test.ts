import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { STUDENT_COLUMNS } from '../src/import/students.js';
import { TEACHER_COLUMNS } from '../src/import/teachers.js';
import { QUIZ_QUESTION_COLUMNS } from '../src/import/quizQuestions.js';
import { createAdmin, createClass, createTeacher, loginAndGetCookie, validQuizShellPayload } from './helpers/quizFixtures.js';

const app = createApp();
const PREFIX = 'import-template-';

describe('import templates (FR-052a): header matches the validator\'s columns, example rows pass validation unmodified', () => {
  let adminCookie: string[];
  let teacherCookie: string[];

  beforeAll(async () => {
    // The students template's example row uses class "10A" (matching the real sample data),
    // so it must exist for the round-trip import to succeed.
    await prisma.class.upsert({ where: { name: '10A' }, update: {}, create: { name: '10A' } });
    const admin = await createAdmin({ username: `${PREFIX}admin@x.test` });
    adminCookie = await loginAndGetCookie(app, admin.username);
    const teacher = await createTeacher({ username: `${PREFIX}teacher@x.test` });
    teacherCookie = await loginAndGetCookie(app, teacher.username);
  });

  afterAll(async () => {
    // Quiz rows reference the fixture teacher via ownerId with no cascade, so they must be
    // removed before the User rows they point to.
    await cleanupQuizFixturesForTemplate();

    await prisma.session.deleteMany({ where: { user: { username: { startsWith: PREFIX } } } });
    await prisma.student.deleteMany({ where: { studentId: { in: ['1101', '1102'] } } });
    await prisma.user.deleteMany({ where: { username: { in: ['1101', '1102'] } } });
    for (const col of TEACHER_COLUMNS.find((c) => c.key === 'email')!.example) {
      await prisma.session.deleteMany({ where: { user: { username: col } } });
      await prisma.teacher.deleteMany({ where: { email: col } });
      await prisma.user.deleteMany({ where: { username: col } });
    }
    await prisma.teacher.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.class.deleteMany({ where: { name: '10A' } });
    await prisma.class.deleteMany({ where: { name: `${PREFIX}class` } });
  });

  async function cleanupQuizFixturesForTemplate() {
    await prisma.question.deleteMany({ where: { quiz: { title: { startsWith: 'Fixture Quiz' } } } });
    await prisma.quizClass.deleteMany({ where: { quiz: { title: { startsWith: 'Fixture Quiz' } } } });
    await prisma.quiz.deleteMany({ where: { title: { startsWith: 'Fixture Quiz' } } });
  }

  it('students template header matches STUDENT_COLUMNS, and its example rows import successfully', async () => {
    const res = await request(app).get('/api/admin/import/students/template').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');

    const text: string = res.text.replace(/^﻿/, '');
    const lines = text.trim().split('\r\n');
    expect(lines[0].split(',')).toEqual(STUDENT_COLUMNS.map((c) => c.header));
    expect(lines.length).toBe(1 + STUDENT_COLUMNS[0].example.length);

    const importRes = await request(app)
      .post('/api/admin/import/students')
      .set('Cookie', adminCookie)
      .attach('file', Buffer.from(res.text, 'utf8'), 'students-template.csv');
    expect(importRes.status).toBe(200);
    expect(importRes.body.created).toBe(2);
  });

  it('teachers template header matches TEACHER_COLUMNS, and its example rows import successfully', async () => {
    const res = await request(app).get('/api/admin/import/teachers/template').set('Cookie', adminCookie);
    expect(res.status).toBe(200);

    const text: string = res.text.replace(/^﻿/, '');
    const lines = text.trim().split('\r\n');
    expect(lines[0].split(',')).toEqual(TEACHER_COLUMNS.map((c) => c.header));

    const importRes = await request(app)
      .post('/api/admin/import/teachers')
      .set('Cookie', adminCookie)
      .attach('file', Buffer.from(res.text, 'utf8'), 'teachers-template.csv');
    expect(importRes.status).toBe(200);
    expect(importRes.body.created).toBe(2);
  });

  it('quiz-questions template header matches QUIZ_QUESTION_COLUMNS, and its example rows import successfully', async () => {
    const res = await request(app).get('/api/teacher/import/quiz-questions/template').set('Cookie', teacherCookie);
    expect(res.status).toBe(200);

    const text: string = res.text.replace(/^﻿/, '');
    const lines = text.trim().split('\r\n');
    expect(lines[0].split(',')).toEqual(QUIZ_QUESTION_COLUMNS.map((c) => c.header));

    const classId = (await createClass(`${PREFIX}class`)).id;
    const createRes = await request(app)
      .post('/api/teacher/quizzes')
      .set('Cookie', teacherCookie)
      .send(validQuizShellPayload({ classIds: [classId] }));
    const quizId = createRes.body.quiz.id;

    const importRes = await request(app)
      .post(`/api/teacher/quizzes/${quizId}/questions/import`)
      .set('Cookie', teacherCookie)
      .attach('file', Buffer.from(res.text, 'utf8'), 'quiz-questions-template.csv');
    expect(importRes.status).toBe(200);
    expect(importRes.body.questions).toHaveLength(QUIZ_QUESTION_COLUMNS[0].example.length);
  });
});
