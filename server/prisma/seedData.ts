// The one-command sample-data loader (PLAN.md Phase 6 / SPEC section 6). Students and teachers
// are loaded through the real import pipeline from CSV files under server/sample-data, in the
// exact format an admin would upload — so loading the sample also exercises the importer, per
// SPEC section 6's last bullet. Quiz shells are created directly (import carries only questions,
// per FR-055/DECISIONS.md §2 #8), then each quiz's questions are loaded the same way, through
// parseQuizQuestionsFile + replaceQuizQuestions.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Option, Question } from '@prisma/client';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth/hash.js';
import { computeDeadline } from '../src/quiz/deadline.js';
import { replaceQuizQuestions } from '../src/quiz/questions.js';
import { computeScore } from '../src/quiz/scoring.js';
import { importStudents } from '../src/import/students.js';
import { importTeachers } from '../src/import/teachers.js';
import { parseQuizQuestionsFile } from '../src/import/quizQuestions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleDataDir = path.resolve(__dirname, '../sample-data');

/** Every documented sample login (admin, and one representative teacher/student) shares this
 * password, pinned after import so it stays stable across repeated `npm run setup` runs even
 * though the importer normally generates a random initial password per person (FR-054). */
export const DEMO_PASSWORD = 'password123';

const DOCUMENTED_TEACHER_EMAIL = 'teacher@nourscentre.test';
const DOCUMENTED_STUDENT_ID = '1001';
const ADMIN_USERNAME = 'nour@nourscentre.test';

function loadSampleFile(name: string): Buffer {
  return readFileSync(path.join(sampleDataDir, name));
}

async function ensureClasses(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const name of ['10A', '10B', '11A']) {
    const klass = await prisma.class.upsert({ where: { name }, update: {}, create: { name } });
    ids[name] = klass.id;
  }
  return ids;
}

async function ensureAdmin() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  return prisma.user.upsert({
    where: { username: ADMIN_USERNAME },
    update: {},
    create: { username: ADMIN_USERNAME, passwordHash, role: 'ADMIN', nameAr: 'نور', nameEn: 'Nour' },
  });
}

async function pinPassword(username: string) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await prisma.user.update({ where: { username }, data: { passwordHash } });
}

interface QuizSpec {
  title: string;
  ownerEmail: string;
  classNames: string[];
  timeLimitMinutes: number;
  openAt: Date;
  closeAt: Date;
  negativeMarking: boolean;
  penaltyFraction: number;
  status: 'DRAFT' | 'PUBLISHED';
  questionsFile: string;
}

async function ensureQuiz(spec: QuizSpec, classIds: Record<string, string>): Promise<string> {
  const existing = await prisma.quiz.findFirst({ where: { title: spec.title } });
  if (existing) return existing.id;

  const owner = await prisma.teacher.findUniqueOrThrow({ where: { email: spec.ownerEmail } });
  const quiz = await prisma.quiz.create({
    data: {
      ownerId: owner.userId,
      title: spec.title,
      timeLimitMinutes: spec.timeLimitMinutes,
      openAt: spec.openAt,
      closeAt: spec.closeAt,
      negativeMarking: spec.negativeMarking,
      penaltyFraction: spec.penaltyFraction,
      status: spec.status,
      classes: { create: spec.classNames.map((name) => ({ classId: classIds[name] })) },
    },
  });

  const parsed = parseQuizQuestionsFile(loadSampleFile(spec.questionsFile));
  if (parsed.errors.length > 0) {
    throw new Error(`Sample quiz "${spec.title}": questions file failed validation — ${JSON.stringify(parsed.errors)}`);
  }
  await replaceQuizQuestions(quiz.id, parsed.value!);

  return quiz.id;
}

type QuestionWithOptions = Question & { options: Option[] };

/** Seeds a mix of finished attempts for a *closed* quiz, so its results page isn't empty
 * (SPEC section 6) and demonstrates every attempt status: a couple of manual submissions with
 * varying scores, one auto-submitted, and one left untouched past its deadline so the next
 * page load demonstrates lazy finalize-on-read (FR-025) with real seed data. */
async function seedClosedQuizAttempts(quizId: string, classId: string) {
  const existingCount = await prisma.attempt.count({ where: { quizId } });
  if (existingCount > 0) return;

  const quiz = await prisma.quiz.findUniqueOrThrow({ where: { id: quizId } });
  const questions: QuestionWithOptions[] = await prisma.question.findMany({
    where: { quizId },
    orderBy: { order: 'asc' },
    include: { options: true },
  });
  const students = await prisma.student.findMany({ where: { classId }, orderBy: { studentId: 'asc' }, take: 7 });

  async function createAttempt(
    student: (typeof students)[number],
    opts: { submissionType: 'MANUAL' | 'AUTO' | null; correctFraction: number },
  ) {
    const startedAt = new Date(quiz.closeAt.getTime() - 15 * 60_000);
    const deadline = computeDeadline(startedAt, quiz.timeLimitMinutes, quiz.closeAt);

    const answerMap = new Map<string, string>();
    questions.forEach((q, i) => {
      const wantCorrect = i < Math.round(questions.length * opts.correctFraction);
      const option = wantCorrect ? q.options.find((o) => o.isCorrect)! : q.options.find((o) => !o.isCorrect)!;
      answerMap.set(q.id, option.id);
    });

    const score = opts.submissionType ? computeScore(questions, answerMap, quiz.negativeMarking, quiz.penaltyFraction) : null;
    const submittedAt = opts.submissionType ? new Date(deadline.getTime() - 60_000) : null;

    const attempt = await prisma.attempt.create({
      data: { studentId: student.id, quizId, startedAt, deadline, submittedAt, submissionType: opts.submissionType, score },
    });
    await prisma.answer.createMany({
      data: [...answerMap.entries()].map(([questionId, optionId]) => ({ attemptId: attempt.id, questionId, optionId })),
    });
  }

  if (students[0]) await createAttempt(students[0], { submissionType: 'MANUAL', correctFraction: 1 });
  if (students[1]) await createAttempt(students[1], { submissionType: 'MANUAL', correctFraction: 0.6 });
  if (students[2]) await createAttempt(students[2], { submissionType: 'MANUAL', correctFraction: 0 });
  if (students[3]) await createAttempt(students[3], { submissionType: 'AUTO', correctFraction: 0.4 });
  // Left as still "in progress" with a deadline already in the past — the results page's lazy
  // finalize-on-read will auto-submit it the first time anyone loads it (FR-025).
  if (students[4]) await createAttempt(students[4], { submissionType: null, correctFraction: 0.5 });
}

export interface SeedSummary {
  admin: { username: string; password: string };
  documentedTeacher: { username: string; password: string };
  documentedStudent: { username: string; password: string };
  studentsImported: number;
  teachersImported: number;
}

export async function seedDatabase(): Promise<SeedSummary> {
  const classIds = await ensureClasses();
  await ensureAdmin();

  const teachersSummary = await importTeachers(loadSampleFile('teachers.csv'));
  const studentsSummary = await importStudents(loadSampleFile('students.csv'));

  await pinPassword(ADMIN_USERNAME);
  await pinPassword(DOCUMENTED_TEACHER_EMAIL);
  await pinPassword(DOCUMENTED_STUDENT_ID);

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  // No attempts are seeded on this one — it's the "open, nobody has finished it yet" case.
  await ensureQuiz(
    {
      title: 'Algebra Basics',
      ownerEmail: 'teacher@nourscentre.test',
      classNames: ['10A'],
      timeLimitMinutes: 20,
      openAt: new Date(now - 2 * day),
      closeAt: new Date(now + 2 * day),
      negativeMarking: false,
      penaltyFraction: 0,
      status: 'PUBLISHED',
      questionsFile: 'quiz-algebra-basics-questions.csv',
    },
    classIds,
  );

  // Open (not closed) fully-Arabic quiz, targeting the documented student's own class (10A), so
  // Phase 7's RTL/mobile demo has a live quiz to take at 360px — the other Arabic quiz below is
  // closed and only viewable via results. Question 6/7/14 mix Arabic and English within one
  // question (FR-061/062), demonstrating that direction is detected per text block.
  await ensureQuiz(
    {
      title: 'اختبار عام',
      ownerEmail: 'teacher@nourscentre.test',
      classNames: ['10A'],
      timeLimitMinutes: 20,
      openAt: new Date(now - 1 * day),
      closeAt: new Date(now + 30 * day),
      negativeMarking: false,
      penaltyFraction: 0,
      status: 'PUBLISHED',
      questionsFile: 'quiz-arabic-open-questions.csv',
    },
    classIds,
  );

  const arabicMathQuizId = await ensureQuiz(
    {
      title: 'الرياضيات - الوحدة الثانية',
      ownerEmail: 'teacher@nourscentre.test',
      classNames: ['10B'],
      timeLimitMinutes: 20,
      openAt: new Date(now - 10 * day),
      closeAt: new Date(now - 2 * day),
      negativeMarking: true,
      penaltyFraction: 0.25,
      status: 'PUBLISHED',
      questionsFile: 'quiz-arabic-math-questions.csv',
    },
    classIds,
  );

  await ensureQuiz(
    {
      title: 'Science Quiz 2',
      ownerEmail: 'teacher2@nourscentre.test',
      classNames: ['11A'],
      timeLimitMinutes: 20,
      openAt: new Date(now + 2 * day),
      closeAt: new Date(now + 5 * day),
      negativeMarking: false,
      penaltyFraction: 0,
      status: 'PUBLISHED',
      questionsFile: 'quiz-science-questions.csv',
    },
    classIds,
  );

  await ensureQuiz(
    {
      title: 'English Vocabulary (Draft)',
      ownerEmail: 'teacher3@nourscentre.test',
      classNames: ['10A'],
      timeLimitMinutes: 20,
      openAt: new Date(now + 7 * day),
      closeAt: new Date(now + 10 * day),
      negativeMarking: false,
      penaltyFraction: 0,
      status: 'DRAFT',
      questionsFile: 'quiz-vocab-draft-questions.csv',
    },
    classIds,
  );

  await seedClosedQuizAttempts(arabicMathQuizId, classIds['10B']);

  return {
    admin: { username: ADMIN_USERNAME, password: DEMO_PASSWORD },
    documentedTeacher: { username: DOCUMENTED_TEACHER_EMAIL, password: DEMO_PASSWORD },
    documentedStudent: { username: DOCUMENTED_STUDENT_ID, password: DEMO_PASSWORD },
    studentsImported: studentsSummary.created,
    teachersImported: teachersSummary.created,
  };
}
