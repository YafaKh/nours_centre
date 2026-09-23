import { describe, expect, it } from 'vitest';
import { computeScore, type ScoredQuestion } from '../src/quiz/scoring.js';

function q(id: string, points: number, correctIndex: number): ScoredQuestion {
  return {
    id,
    points,
    options: [0, 1, 2, 3].map((i) => ({ id: `${id}-opt${i}`, isCorrect: i === correctIndex })),
  };
}

describe('scoring (FR-030-036): sum signed per-question contributions, then floor once at the total', () => {
  it('all correct: full points, unaffected by negative marking either way', () => {
    const questions = [q('q1', 4, 0), q('q2', 2, 1), q('q3', 1, 2)];
    const answers = new Map([
      ['q1', 'q1-opt0'],
      ['q2', 'q2-opt1'],
      ['q3', 'q3-opt2'],
    ]);
    expect(computeScore(questions, answers, false, 0)).toBe(7);
    expect(computeScore(questions, answers, true, 0.25)).toBe(7);
  });

  it('all wrong, negative marking off: 0 (FR-032)', () => {
    const questions = [q('q1', 4, 0), q('q2', 2, 1)];
    const answers = new Map([
      ['q1', 'q1-opt1'],
      ['q2', 'q2-opt2'],
    ]);
    expect(computeScore(questions, answers, false, 0.25)).toBe(0);
  });

  it('all wrong, negative marking on: floored at 0, never negative (FR-033/FR-035)', () => {
    const questions = [q('q1', 4, 0), q('q2', 2, 1)];
    const answers = new Map([
      ['q1', 'q1-opt1'],
      ['q2', 'q2-opt2'],
    ]);
    expect(computeScore(questions, answers, true, 0.25)).toBe(0);
  });

  it('unanswered questions always score 0, never negative, regardless of negative marking (FR-031)', () => {
    const questions = [q('q1', 4, 0), q('q2', 2, 1)];
    const answers = new Map<string, string>();
    expect(computeScore(questions, answers, true, 1)).toBe(0);
    expect(computeScore(questions, answers, false, 0)).toBe(0);
  });

  it('mixed: the wrong-answer penalty nets against the correct-answer points before the floor (FR-033/PLAN decision #2)', () => {
    // q1 correct: +4. q2 wrong, penalty 0.25 of 4 points = -1. Net before floor: 3.
    const questions = [q('q1', 4, 0), q('q2', 4, 1)];
    const answers = new Map([
      ['q1', 'q1-opt0'],
      ['q2', 'q2-opt2'], // wrong
    ]);
    expect(computeScore(questions, answers, true, 0.25)).toBe(3);
  });

  it('floors once at the quiz total, not per question', () => {
    // q1 wrong on a 12-point question, penalty 0.25 -> -3. q2 correct: +2. Sum before floor: -1 -> 0.
    // A PER-QUESTION floor would instead floor q1's -3 to 0 individually and give a total of 2 —
    // this proves the floor is applied once, at the end, to the summed total (PLAN.md decision #2).
    const questions = [q('q1', 12, 0), q('q2', 2, 1)];
    const answers = new Map([
      ['q1', 'q1-opt1'], // wrong
      ['q2', 'q2-opt1'], // correct
    ]);
    expect(computeScore(questions, answers, true, 0.25)).toBe(0);
  });

  it('mixed correct/wrong/unanswered together', () => {
    // q1 correct +4, q2 wrong -1 (0.25 * 4), q3 unanswered 0, q4 correct +2. Total = 5.
    const questions = [q('q1', 4, 0), q('q2', 4, 1), q('q3', 3, 2), q('q4', 2, 3)];
    const answers = new Map([
      ['q1', 'q1-opt0'],
      ['q2', 'q2-opt3'], // wrong
      ['q4', 'q4-opt3'],
    ]);
    expect(computeScore(questions, answers, true, 0.25)).toBe(5);
  });
});
