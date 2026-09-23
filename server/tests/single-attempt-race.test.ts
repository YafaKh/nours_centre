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
const PREFIX = 'race-';

describe('single-attempt race (FR-027): concurrent start-attempt requests never create two Attempt rows', () => {
  let studentCookie: string[];
  let studentRecordId: string;
  let classId: string;
  let quizId: string;

  beforeAll(async () => {
    const klass = await prisma.class.create({ data: { name: `${PREFIX}class` } });
    classId = klass.id;

    const teacher = await createTeacher({ username: `${PREFIX}teacher@x.test` });
    const teacherCookie = await loginAndGetCookie(app, teacher.username);

    const student = await createStudent(classId, { studentId: `${PREFIX}student-001` });
    if (!student.student) throw new Error('expected student relation to be created');
    studentRecordId = student.student.id;
    studentCookie = await loginAndGetCookie(app, student.username);

    quizId = await createPublishedQuiz(app, teacherCookie, { classIds: [classId] });
  });

  afterAll(async () => {
    await cleanupQuizFixtures([PREFIX], `${PREFIX}class`);
  });

  it('creates exactly one Attempt row from 10 concurrent start requests, all returning 200', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', studentCookie),
      ),
    );

    for (const res of responses) {
      expect(res.status).toBe(200);
    }

    const attemptIds = new Set(responses.map((r) => r.body.id));
    expect(attemptIds.size).toBe(1);

    const count = await prisma.attempt.count({ where: { studentId: studentRecordId, quizId } });
    expect(count).toBe(1);
  });
});
