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
const PREFIX = 'results-roster-';

interface RosterRow {
  studentId: string;
  status: string;
  score: number | null;
}

describe('results roster (FR-040-042): every target-class student appears, with the right status and stats', () => {
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

  it('reports not-attempted/in-progress/submitted/auto-submitted correctly, plus summary and per-question stats', async () => {
    const notAttempted = await createStudent(classId, { studentId: `${PREFIX}s-not-attempted` });
    const inProgress = await createStudent(classId, { studentId: `${PREFIX}s-in-progress` });
    const submitted = await createStudent(classId, { studentId: `${PREFIX}s-submitted` });
    const autoSubmitted = await createStudent(classId, { studentId: `${PREFIX}s-auto` });

    // In progress: starts, answers nothing, never submits or expires.
    const inProgressCookie = await loginAndGetCookie(app, inProgress.username);
    await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', inProgressCookie);

    // Submitted: answers every question correctly (fixture: option index i%4 is correct for
    // question order i — see validQuestionsPayload) and submits manually.
    const submittedCookie = await loginAndGetCookie(app, submitted.username);
    const start = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', submittedCookie);
    for (const question of start.body.questions) {
      const correctIndex = question.order % 4;
      await request(app)
        .put(`/api/student/attempts/${start.body.id}/answers`)
        .set('Cookie', submittedCookie)
        .send({ questionId: question.id, optionId: question.options[correctIndex].id });
    }
    const submitRes = await request(app)
      .post(`/api/student/attempts/${start.body.id}/submit`)
      .set('Cookie', submittedCookie);
    expect(submitRes.body.score).toBe(60); // 15 questions * 4 points, all correct

    // Auto-submitted: starts, answers nothing, deadline backdated so the results read finalizes it.
    const autoCookie = await loginAndGetCookie(app, autoSubmitted.username);
    const autoStart = await request(app).post(`/api/student/quizzes/${quizId}/attempt`).set('Cookie', autoCookie);
    await setAttemptDeadline(autoStart.body.id, new Date(Date.now() - 60_000));

    const results = await request(app).get(`/api/teacher/quizzes/${quizId}/results`).set('Cookie', teacherCookie);
    expect(results.status).toBe(200);

    const roster: RosterRow[] = results.body.roster;
    expect(roster).toHaveLength(4);

    function row(studentId: string): RosterRow {
      const found = roster.find((r) => r.studentId === studentId);
      expect(found).toBeDefined();
      return found!;
    }

    expect(row(notAttempted.username)).toMatchObject({ status: 'NOT_ATTEMPTED', score: null });
    expect(row(inProgress.username)).toMatchObject({ status: 'IN_PROGRESS', score: null });
    expect(row(submitted.username)).toMatchObject({ status: 'SUBMITTED', score: 60 });
    expect(row(autoSubmitted.username)).toMatchObject({ status: 'AUTO_SUBMITTED', score: 0 });

    expect(results.body.summary).toMatchObject({
      totalStudents: 4,
      attempted: 3, // everyone except not-attempted
      scored: 2, // submitted + auto-submitted
      average: 30, // (60 + 0) / 2
      highest: 60,
      lowest: 0,
    });

    expect(results.body.questionStats).toHaveLength(15);
    // Question order 0: submitted got it right (answered the correct option), auto-submitted
    // never answered anything -> counts as wrong. 1 of 2 scored attempts correct = 50%.
    const q0 = results.body.questionStats.find((s: { order: number }) => s.order === 0);
    expect(q0.percentCorrect).toBe(50);
  });

  it('reports every stat as null/zero for a quiz nobody has attempted yet', async () => {
    const secondQuizId = await createPublishedQuiz(app, teacherCookie, { classIds: [classId] });

    const results = await request(app)
      .get(`/api/teacher/quizzes/${secondQuizId}/results`)
      .set('Cookie', teacherCookie);

    expect(results.status).toBe(200);
    expect(results.body.summary).toMatchObject({ attempted: 0, scored: 0, average: null, highest: null, lowest: null });
    expect(results.body.questionStats.every((s: { percentCorrect: number | null }) => s.percentCorrect === null)).toBe(
      true,
    );
  });
});
