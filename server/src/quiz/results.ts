// FR-040/FR-041/FR-042: the full per-quiz results roster (every target-class student, not just
// the ones with an attempt), summary stats, and per-question % correct. Phase 4 only needed a
// list of existing Attempt rows (see routes/teacher.ts GET /quizzes/:id/attempts); this is the
// "full roster" that endpoint's comment deferred to Phase 5.

import type { Attempt, Answer } from '@prisma/client';
import { prisma } from '../db.js';
import { finalizeIfExpired } from './finalize.js';
import { toCsv } from './csv.js';

export type AttemptStatus = 'NOT_ATTEMPTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED';

export interface RosterRow {
  studentId: string;
  nameAr: string | null;
  nameEn: string | null;
  className: string;
  status: AttemptStatus;
  score: number | null;
  startedAt: Date | null;
  submittedAt: Date | null;
}

export interface QuestionStat {
  questionId: string;
  order: number;
  text: string;
  /** Percentage of scored (submitted/auto-submitted) attempts that got this question right.
   * null when nobody has been scored yet. */
  percentCorrect: number | null;
}

export interface QuizResults {
  quizId: string;
  title: string;
  maxScore: number;
  roster: RosterRow[];
  summary: {
    totalStudents: number;
    attempted: number;
    scored: number;
    average: number | null;
    highest: number | null;
    lowest: number | null;
  };
  questionStats: QuestionStat[];
}

function statusFor(attempt: Pick<Attempt, 'submittedAt' | 'submissionType'> | null): AttemptStatus {
  if (!attempt) return 'NOT_ATTEMPTED';
  if (!attempt.submittedAt) return 'IN_PROGRESS';
  return attempt.submissionType === 'AUTO' ? 'AUTO_SUBMITTED' : 'SUBMITTED';
}

export async function getQuizResults(quizId: string): Promise<QuizResults> {
  const quiz = await prisma.quiz.findUniqueOrThrow({
    where: { id: quizId },
    include: {
      classes: { include: { class: { include: { students: { include: { user: true } } } } } },
      questions: { orderBy: { order: 'asc' }, include: { options: true } },
    },
  });

  // A student belongs to exactly one class, and a quiz can't target the same class twice
  // (QuizClass's composite id), so a student can never appear twice here.
  const students = quiz.classes.flatMap((qc) =>
    qc.class.students.map((s) => ({ ...s, className: qc.class.name })),
  );

  const attempts = await prisma.attempt.findMany({
    where: { quizId },
    include: { answers: true },
  });
  // Lazy finalize-on-read (FR-025): opening the results page catches any expired attempt
  // immediately, same as the student dashboard and the Phase 4 attempts list.
  const finalized = await Promise.all(attempts.map((a) => finalizeIfExpired(a)));
  const answersByAttemptId = new Map<string, Answer[]>(attempts.map((a) => [a.id, a.answers]));
  const attemptByStudentId = new Map(finalized.map((a, i) => [attempts[i].studentId, a]));

  const roster: RosterRow[] = students.map((s) => {
    const attempt = attemptByStudentId.get(s.id) ?? null;
    return {
      studentId: s.studentId,
      nameAr: s.user.nameAr,
      nameEn: s.user.nameEn,
      className: s.className,
      status: statusFor(attempt),
      score: attempt?.score ?? null,
      startedAt: attempt?.startedAt ?? null,
      submittedAt: attempt?.submittedAt ?? null,
    };
  });

  const attempted = roster.filter((r) => r.status !== 'NOT_ATTEMPTED').length;
  const scoredAttempts = finalized.filter((a) => a.submittedAt !== null);
  const scores = scoredAttempts.map((a) => a.score).filter((s): s is number => s !== null);

  const summary = {
    totalStudents: roster.length,
    attempted,
    scored: scores.length,
    average: scores.length ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null,
    highest: scores.length ? Math.max(...scores) : null,
    lowest: scores.length ? Math.min(...scores) : null,
  };

  // Denominator is every scored attempt (unanswered counts against a question, same as scoring
  // treats it), not just the students who happened to answer that particular question.
  const questionStats: QuestionStat[] = quiz.questions.map((q) => {
    if (scoredAttempts.length === 0) {
      return { questionId: q.id, order: q.order, text: q.text, percentCorrect: null };
    }
    const correctOptionId = q.options.find((o) => o.isCorrect)?.id;
    let correct = 0;
    for (const attempt of scoredAttempts) {
      const answers = answersByAttemptId.get(attempt.id) ?? [];
      const chosen = answers.find((a) => a.questionId === q.id);
      if (chosen && chosen.optionId === correctOptionId) correct += 1;
    }
    return {
      questionId: q.id,
      order: q.order,
      text: q.text,
      percentCorrect: Math.round((correct / scoredAttempts.length) * 1000) / 10,
    };
  });

  const maxScore = quiz.questions.reduce((sum, q) => sum + q.points, 0);

  return { quizId: quiz.id, title: quiz.title, maxScore, roster, summary, questionStats };
}

export const RESULTS_CSV_HEADER = [
  'Student ID',
  'Name (Arabic)',
  'Name (English)',
  'Class',
  'Status',
  'Score',
  'Submitted At',
];

const STATUS_LABEL: Record<AttemptStatus, string> = {
  NOT_ATTEMPTED: 'Not attempted',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
  AUTO_SUBMITTED: 'Auto-submitted',
};

// FR-043: UTF-8 BOM + proper quoting via toCsv, generated straight from the same roster the
// JSON results endpoint returns, so the two can never disagree.
export function resultsToCsv(results: QuizResults): string {
  const rows = [
    RESULTS_CSV_HEADER,
    ...results.roster.map((r) => [
      r.studentId,
      r.nameAr ?? '',
      r.nameEn ?? '',
      r.className,
      STATUS_LABEL[r.status],
      r.score === null ? '' : String(r.score),
      r.submittedAt ? r.submittedAt.toISOString() : '',
    ]),
  ];
  return toCsv(rows);
}
