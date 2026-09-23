import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { seedDatabase } from '../prisma/seedData.js';

const app = createApp();

describe('sample-data loader (SPEC section 6): fresh seed produces the documented sample data and every documented login works', () => {
  it('seeds the expected row counts and quiz mix', async () => {
    const summary = await seedDatabase();

    expect(await prisma.class.count()).toBeGreaterThanOrEqual(3);
    expect(await prisma.student.count()).toBeGreaterThanOrEqual(60);
    expect(await prisma.teacher.count()).toBeGreaterThanOrEqual(4);
    expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBeGreaterThanOrEqual(1);

    const quizzes = await prisma.quiz.findMany();
    expect(quizzes.length).toBeGreaterThanOrEqual(4);

    const now = new Date();
    const open = quizzes.filter((q) => q.status === 'PUBLISHED' && q.openAt <= now && q.closeAt >= now);
    const closed = quizzes.filter((q) => q.status === 'PUBLISHED' && q.closeAt < now);
    const upcoming = quizzes.filter((q) => q.status === 'PUBLISHED' && q.openAt > now);
    const drafts = quizzes.filter((q) => q.status === 'DRAFT');
    expect(open.length).toBeGreaterThanOrEqual(1);
    expect(closed.length).toBeGreaterThanOrEqual(1);
    expect(upcoming.length).toBeGreaterThanOrEqual(1);
    expect(drafts.length).toBeGreaterThanOrEqual(1);

    // At least one quiz negative-marking, one not.
    expect(quizzes.some((q) => q.negativeMarking)).toBe(true);
    expect(quizzes.some((q) => !q.negativeMarking)).toBe(true);

    // Every quiz got its 15 questions.
    for (const quiz of quizzes) {
      const count = await prisma.question.count({ where: { quizId: quiz.id } });
      expect(count).toBe(15);
    }

    // The closed quiz has finished attempts, so its results page isn't empty.
    expect(await prisma.attempt.count()).toBeGreaterThan(0);

    // At least one fully-Arabic quiz title (SPEC section 6: at least one quiz fully in Arabic).
    const arabicLetterRe = /[؀-ۿ]/;
    expect(quizzes.some((q) => arabicLetterRe.test(q.title))).toBe(true);

    expect(summary.studentsImported).toBeGreaterThan(0);
    expect(summary.teachersImported).toBeGreaterThan(0);
  });

  it('every documented sample login works', async () => {
    const summary = await seedDatabase(); // idempotent re-run, same as `npm run setup` run twice

    for (const account of [summary.admin, summary.documentedTeacher, summary.documentedStudent]) {
      const res = await request(app).post('/api/auth/login').send({ username: account.username, password: account.password });
      expect(res.status, `login should succeed for ${account.username}`).toBe(200);
    }
  });
});
