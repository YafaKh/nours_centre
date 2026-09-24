import { prisma } from '../db.js';

/**
 * FR-014: once any student has started a quiz, the whole quiz — shell fields, questions,
 * options, correct answers, points, close date — is locked with no exceptions (Phase 2
 * lock-rule test). Presence of a single Attempt row is authoritative.
 */
export async function isQuizLocked(quizId: string): Promise<boolean> {
  const count = await prisma.attempt.count({ where: { quizId } });
  return count > 0;
}
