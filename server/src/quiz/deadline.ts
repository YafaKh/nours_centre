// Shared by the answer-write endpoint (Phase 3) and the submit/auto-finalize endpoints
// (Phase 4), per DECISIONS.md §2 #4, so the grace period is never retrofitted.

export const GRACE_PERIOD_MS = 10_000;

/** FR-022: the earlier of (start + time limit) and the quiz close time. */
export function computeDeadline(startedAt: Date, timeLimitMinutes: number, closeAt: Date): Date {
  const byTimeLimit = new Date(startedAt.getTime() + timeLimitMinutes * 60_000);
  return byTimeLimit.getTime() < closeAt.getTime() ? byTimeLimit : closeAt;
}

/** FR-026: a small grace period for network delay, checked against server-received time only. */
export function isPastDeadline(deadline: Date, now: Date = new Date(), graceMs = GRACE_PERIOD_MS): boolean {
  return now.getTime() > deadline.getTime() + graceMs;
}
