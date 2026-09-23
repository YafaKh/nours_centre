import type { Attempt } from '@prisma/client';
import { prisma } from '../db.js';
import { GRACE_PERIOD_MS, isPastDeadline } from './deadline.js';
import { computeScore } from './scoring.js';

async function scoreAttempt(attemptId: string, quizId: string): Promise<number> {
  const [quiz, questions, answers] = await Promise.all([
    prisma.quiz.findUniqueOrThrow({ where: { id: quizId } }),
    prisma.question.findMany({ where: { quizId }, include: { options: true } }),
    prisma.answer.findMany({ where: { attemptId } }),
  ]);
  const answerMap = new Map(answers.map((a) => [a.questionId, a.optionId]));
  return computeScore(questions, answerMap, quiz.negativeMarking, quiz.penaltyFraction);
}

// A conditional update (guarded by submittedAt: null) rather than a plain update, so two
// finalize calls landing on the same attempt at once (e.g. the sweep and a request) can't
// both "win" and score it twice.
async function finalize(attemptId: string, quizId: string, submissionType: 'AUTO' | 'MANUAL', submittedAt: Date): Promise<Attempt> {
  const score = await scoreAttempt(attemptId, quizId);
  await prisma.attempt.updateMany({
    where: { id: attemptId, submittedAt: null },
    data: { submittedAt, submissionType, score },
  });
  return prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
}

/**
 * FR-025/FR-026: called on every attempt read/write. If the deadline (plus grace) has passed
 * and the attempt hasn't been submitted yet, scores and finalizes it as AUTO — using the
 * attempt's own deadline as the submission instant and only ever the server's clock to decide
 * lateness (SC-003), never a client-supplied timestamp. No-op otherwise.
 */
export async function finalizeIfExpired(attempt: Pick<Attempt, 'id' | 'quizId' | 'deadline' | 'submittedAt'>): Promise<Attempt> {
  if (attempt.submittedAt) return attempt as Attempt;
  if (!isPastDeadline(attempt.deadline)) return attempt as Attempt;
  return finalize(attempt.id, attempt.quizId, 'AUTO', attempt.deadline);
}

/**
 * A student-initiated submit. Callers must first confirm the attempt is not past its deadline
 * (e.g. via finalizeIfExpired) — this always records submissionType MANUAL.
 */
export function finalizeManually(attempt: Pick<Attempt, 'id' | 'quizId'>, now: Date): Promise<Attempt> {
  return finalize(attempt.id, attempt.quizId, 'MANUAL', now);
}

/**
 * Best-effort sweep (PLAN.md: ~30s in-process interval) so dashboards stay fresh without
 * waiting for a student or teacher request to trigger the lazy finalize-on-read/write path.
 * Not required for correctness — every read/write path finalizes lazily on its own — this only
 * matters for a dashboard nobody has touched since the deadline passed.
 */
export async function sweepExpiredAttempts(now: Date = new Date()): Promise<number> {
  const expired = await prisma.attempt.findMany({
    where: { submittedAt: null, deadline: { lt: new Date(now.getTime() - GRACE_PERIOD_MS) } },
    select: { id: true, quizId: true, deadline: true },
  });
  for (const attempt of expired) {
    await finalize(attempt.id, attempt.quizId, 'AUTO', attempt.deadline);
  }
  return expired.length;
}

let sweepTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoSubmitSweep(intervalMs = 30_000): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    sweepExpiredAttempts().catch((err) => console.error('auto-submit sweep failed', err));
  }, intervalMs);
  sweepTimer.unref?.();
}

export function stopAutoSubmitSweep(): void {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}
