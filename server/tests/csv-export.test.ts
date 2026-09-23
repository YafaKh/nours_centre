import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { RESULTS_CSV_HEADER } from '../src/quiz/results.js';
import {
  cleanupQuizFixtures,
  createPublishedQuiz,
  createStudent,
  createTeacher,
  loginAndGetCookie,
} from './helpers/quizFixtures.js';
import { prisma } from '../src/db.js';

const app = createApp();
const PREFIX = 'csv-export-';

describe('CSV export (FR-043): UTF-8 BOM present, Arabic round-trips exactly, header matches the documented columns', () => {
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

  it('exports a CSV with a leading BOM, the documented header row, and an intact Arabic name', async () => {
    const arabicName = 'سارة أحمد';
    const student = await createStudent(classId, { studentId: `${PREFIX}s-001` });
    await prisma.user.update({ where: { id: student.id }, data: { nameAr: arabicName, nameEn: null } });

    const res = await request(app)
      .get(`/api/teacher/quizzes/${quizId}/results/export`)
      .set('Cookie', teacherCookie);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');

    const text: string = res.text;
    expect(text.charCodeAt(0)).toBe(0xfeff); // UTF-8 BOM (FR-043)

    const lines = text.slice(1).trim().split('\r\n');
    expect(lines[0].split(',')).toEqual(RESULTS_CSV_HEADER);

    const studentLine = lines.find((line) => line.includes(`${PREFIX}s-001`));
    expect(studentLine).toBeDefined();
    expect(studentLine).toContain(arabicName); // Arabic survives round-trip through the CSV body
    expect(studentLine).toContain('Not attempted');
  });
});
