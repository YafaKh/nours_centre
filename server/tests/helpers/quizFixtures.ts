import bcrypt from 'bcrypt';
import request from 'supertest';
import type { Express } from 'express';
import { prisma } from '../../src/db.js';

export const FIXTURE_PASSWORD = 'quiz-fixture-password';

let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export async function createClass(name = unique('quiz-fixture-class')) {
  return prisma.class.create({ data: { name } });
}

export async function createTeacher(overrides: { username?: string; nameEn?: string } = {}) {
  const username = overrides.username ?? `${unique('quiz-fixture-teacher')}@x.test`;
  const passwordHash = await bcrypt.hash(FIXTURE_PASSWORD, 10);
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      role: 'TEACHER',
      nameEn: overrides.nameEn ?? 'Fixture Teacher',
      teacher: { create: { email: username } },
    },
  });
  return user;
}

export async function createAdmin(overrides: { username?: string; nameEn?: string } = {}) {
  const username = overrides.username ?? `${unique('quiz-fixture-admin')}@x.test`;
  const passwordHash = await bcrypt.hash(FIXTURE_PASSWORD, 10);
  return prisma.user.create({
    data: {
      username,
      passwordHash,
      role: 'ADMIN',
      nameEn: overrides.nameEn ?? 'Fixture Admin',
    },
  });
}

export async function createStudent(classId: string, overrides: { studentId?: string; nameEn?: string } = {}) {
  const studentId = overrides.studentId ?? unique('quiz-fixture-student');
  const passwordHash = await bcrypt.hash(FIXTURE_PASSWORD, 10);
  const user = await prisma.user.create({
    data: {
      username: studentId,
      passwordHash,
      role: 'STUDENT',
      nameEn: overrides.nameEn ?? 'Fixture Student',
      student: { create: { studentId, classId } },
    },
    include: { student: true },
  });
  return user;
}

export async function loginAndGetCookie(app: Express, username: string, password = FIXTURE_PASSWORD): Promise<string[]> {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  const cookie = res.headers['set-cookie'];
  if (!cookie) {
    throw new Error(`login failed for ${username}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return cookie;
}

export function validQuizShellPayload(overrides: Partial<Record<string, unknown>> = {}) {
  const now = Date.now();
  return {
    title: unique('Fixture Quiz'),
    classIds: [] as string[],
    timeLimitMinutes: 20,
    openAt: new Date(now - 60_000).toISOString(),
    closeAt: new Date(now + 60 * 60_000).toISOString(),
    negativeMarking: false,
    penaltyFraction: 0,
    ...overrides,
  };
}

export function validQuestionsPayload(count = 15) {
  return Array.from({ length: count }, (_, i) => ({
    text: `Question ${i + 1}?`,
    points: 4,
    options: [
      { text: 'Option A', isCorrect: i % 4 === 0 },
      { text: 'Option B', isCorrect: i % 4 === 1 },
      { text: 'Option C', isCorrect: i % 4 === 2 },
      { text: 'Option D', isCorrect: i % 4 === 3 },
    ],
  }));
}

/** Creates, fills with 15 questions, and publishes a quiz in one call — the shape every
 * Phase 3+ student-facing test needs to get to a quiz a student can actually attempt. */
export async function createPublishedQuiz(
  app: Express,
  teacherCookie: string[],
  overrides: Partial<Record<string, unknown>> = {},
): Promise<string> {
  const createRes = await request(app)
    .post('/api/teacher/quizzes')
    .set('Cookie', teacherCookie)
    .send(validQuizShellPayload(overrides));
  const quizId: string = createRes.body.quiz.id;

  await request(app)
    .put(`/api/teacher/quizzes/${quizId}/questions`)
    .set('Cookie', teacherCookie)
    .send({ questions: validQuestionsPayload(15) });

  await request(app).post(`/api/teacher/quizzes/${quizId}/publish`).set('Cookie', teacherCookie);

  return quizId;
}

/** Backdates an attempt's deadline directly in the DB — the fast, deterministic way to get an
 * "expired" attempt in tests without waiting out a real time limit. */
export async function setAttemptDeadline(attemptId: string, deadline: Date) {
  await prisma.attempt.update({ where: { id: attemptId }, data: { deadline } });
}

export async function cleanupQuizFixtures(usernamePrefixes: string[], classNamePrefix: string) {
  for (const prefix of usernamePrefixes) {
    await prisma.session.deleteMany({ where: { user: { username: { startsWith: prefix } } } });
  }
  await prisma.attempt.deleteMany({ where: { quiz: { title: { startsWith: 'Fixture Quiz' } } } });
  await prisma.option.deleteMany({ where: { question: { quiz: { title: { startsWith: 'Fixture Quiz' } } } } });
  await prisma.question.deleteMany({ where: { quiz: { title: { startsWith: 'Fixture Quiz' } } } });
  await prisma.quizClass.deleteMany({ where: { quiz: { title: { startsWith: 'Fixture Quiz' } } } });
  await prisma.quiz.deleteMany({ where: { title: { startsWith: 'Fixture Quiz' } } });
  for (const prefix of usernamePrefixes) {
    await prisma.student.deleteMany({ where: { studentId: { startsWith: prefix } } });
    await prisma.teacher.deleteMany({ where: { email: { startsWith: prefix } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: prefix } } });
  }
  await prisma.class.deleteMany({ where: { name: { startsWith: classNamePrefix } } });
}
