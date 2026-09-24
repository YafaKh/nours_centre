import fs from 'node:fs';
import path from 'node:path';
import { request } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

// Logging in once per role here (instead of via the UI in every spec) keeps the whole e2e run
// well under the login route's rate limit (5 attempts / 10 min, server/src/auth/routes.ts) —
// these specs share one long-running dev server, so per-test UI logins would exhaust it fast.
const AUTH_DIR = path.join(__dirname, '.auth');
const BASE_URL = 'http://localhost:5173';

// Prisma resolves a relative SQLite path relative to schema.prisma's folder, not the process
// cwd — this file runs from the repo root, so point at the dev DB with an absolute path instead
// (same gotcha noted in server/tests/globalSetup.ts).
const DEV_DB_PATH = path.resolve(__dirname, '../server/prisma/dev.db');

async function saveLogin(username: string, password: string, file: string): Promise<void> {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  const res = await ctx.post('/api/auth/login', { data: { username, password } });
  if (!res.ok()) {
    throw new Error(`global-setup: login failed for ${username} (${res.status()})`);
  }
  await ctx.storageState({ path: file });
  await ctx.dispose();
}

// rtl-render.test.ts and mobile-viewport.test.ts both need the documented student's own attempt
// on the seeded "اختبار عام" quiz to still be un-started, so they can open it and read its live
// question content — a student can no longer reopen a quiz once they've submitted it (see
// SPEC.md §4.3), so a leftover attempt from earlier manual click-through testing would otherwise
// permanently lock these specs out. Reset it here, before every run, rather than depending on
// nobody ever having taken it for real.
async function resetDocumentedStudentAttempt(): Promise<void> {
  const prisma = new PrismaClient({ datasources: { db: { url: `file:${DEV_DB_PATH}` } } });
  try {
    const student = await prisma.student.findUnique({ where: { studentId: '1001' } });
    const quiz = await prisma.quiz.findFirst({ where: { title: 'اختبار عام' } });
    if (!student || !quiz) return;
    await prisma.attempt.deleteMany({ where: { studentId: student.id, quizId: quiz.id } });
  } finally {
    await prisma.$disconnect();
  }
}

export default async function globalSetup(): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await saveLogin('1001', 'password123', path.join(AUTH_DIR, 'student.json'));
  await saveLogin('teacher@nourscentre.test', 'password123', path.join(AUTH_DIR, 'teacher.json'));
  await saveLogin('nour@nourscentre.test', 'password123', path.join(AUTH_DIR, 'admin.json'));
  await resetDocumentedStudentAttempt();
}
