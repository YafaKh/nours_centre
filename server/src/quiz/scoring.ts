// FR-030-036: sum signed per-question contributions, then floor once at the quiz total —
// not per-question (PLAN.md decision #2).

export interface ScoredQuestion {
  id: string;
  points: number;
  options: { id: string; isCorrect: boolean }[];
}

export function computeScore(
  questions: ScoredQuestion[],
  answers: Map<string, string>,
  negativeMarking: boolean,
  penaltyFraction: number,
): number {
  let total = 0;
  for (const q of questions) {
    const chosenOptionId = answers.get(q.id);
    if (!chosenOptionId) continue; // FR-031: unanswered is 0, never negative.

    const chosen = q.options.find((o) => o.id === chosenOptionId);
    if (chosen?.isCorrect) {
      total += q.points; // FR-030
    } else if (negativeMarking) {
      total -= q.points * penaltyFraction; // FR-033
    } // FR-032: wrong with negative marking off is 0, i.e. no change.
  }
  return Math.max(0, total); // FR-035
}
