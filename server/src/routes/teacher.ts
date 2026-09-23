import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { prisma } from '../db.js';
import { finalizeIfExpired } from '../quiz/finalize.js';
import { isQuizLocked } from '../quiz/lock.js';
import { validateQuestions, validateQuizShell } from '../quiz/validation.js';

const router = Router();
// Admin has all teacher abilities (FR-007), so both roles pass here.
router.use(requireAuth, requireRole('TEACHER', 'ADMIN'));

const quizListInclude = {
  classes: { include: { class: true } },
  questions: { select: { id: true } },
  owner: { select: { id: true, nameAr: true, nameEn: true, username: true } },
} as const;

function quizListShape(quiz: {
  id: string;
  title: string;
  timeLimitMinutes: number;
  openAt: Date;
  closeAt: Date;
  negativeMarking: boolean;
  penaltyFraction: number;
  status: string;
  classes: { class: { id: string; name: string } }[];
  questions: { id: string }[];
  owner: { id: string; nameAr: string | null; nameEn: string | null; username: string };
}) {
  return {
    id: quiz.id,
    title: quiz.title,
    timeLimitMinutes: quiz.timeLimitMinutes,
    openAt: quiz.openAt,
    closeAt: quiz.closeAt,
    negativeMarking: quiz.negativeMarking,
    penaltyFraction: quiz.penaltyFraction,
    status: quiz.status,
    classes: quiz.classes.map((c) => c.class),
    questionCount: quiz.questions.length,
    owner: quiz.owner,
  };
}

// A second teacher gets 404 (not 403) on a quiz they don't own, so existence of another
// teacher's quiz is never confirmed to them — admin bypasses this check (FR-007).
async function loadOwnedQuiz(quizId: string, requester: { id: string; role: string }) {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz) return null;
  if (requester.role === 'TEACHER' && quiz.ownerId !== requester.id) return null;
  return quiz;
}

// Kept from Phase 1's roles.test.ts regression check (any authenticated teacher/admin
// route). Quiz authoring itself lives at /quizzes below.
router.get('/dashboard', (req, res) => {
  res.json({ user: req.user });
});

router.get('/classes', async (_req, res) => {
  const classes = await prisma.class.findMany({ orderBy: { name: 'asc' } });
  res.json({ classes });
});

router.get('/quizzes', async (req, res) => {
  const where = req.user!.role === 'ADMIN' ? {} : { ownerId: req.user!.id };
  const quizzes = await prisma.quiz.findMany({
    where,
    include: quizListInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ quizzes: quizzes.map(quizListShape) });
});

router.post('/quizzes', async (req, res) => {
  const result = validateQuizShell(req.body ?? {});
  if (!result.valid) {
    return res.status(400).json({ error: 'Invalid quiz', details: result.errors });
  }
  const value = result.value!;

  const existingClasses = await prisma.class.findMany({ where: { id: { in: value.classIds } } });
  if (existingClasses.length !== value.classIds.length) {
    return res.status(400).json({ error: 'Invalid quiz', details: [{ field: 'classIds', message: 'One or more classes do not exist' }] });
  }

  const quiz = await prisma.quiz.create({
    data: {
      ownerId: req.user!.id,
      title: value.title,
      timeLimitMinutes: value.timeLimitMinutes,
      openAt: value.openAt,
      closeAt: value.closeAt,
      negativeMarking: value.negativeMarking,
      penaltyFraction: value.penaltyFraction,
      status: 'DRAFT',
      classes: { create: value.classIds.map((classId) => ({ classId })) },
    },
    include: quizListInclude,
  });

  res.status(201).json({ quiz: quizListShape(quiz) });
});

router.get('/quizzes/:id', async (req, res) => {
  const quiz = await loadOwnedQuiz(req.params.id, req.user!);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

  const full = await prisma.quiz.findUniqueOrThrow({
    where: { id: quiz.id },
    include: {
      ...quizListInclude,
      questions: { orderBy: { order: 'asc' }, include: { options: { orderBy: { order: 'asc' } } } },
    },
  });

  const locked = await isQuizLocked(quiz.id);

  res.json({
    ...quizListShape(full),
    locked,
    questions: full.questions,
  });
});

router.put('/quizzes/:id', async (req, res) => {
  const quiz = await loadOwnedQuiz(req.params.id, req.user!);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

  if (await isQuizLocked(quiz.id)) {
    return res.status(409).json({ error: 'Quiz is locked: a student has already started it' });
  }

  const result = validateQuizShell(req.body ?? {});
  if (!result.valid) {
    return res.status(400).json({ error: 'Invalid quiz', details: result.errors });
  }
  const value = result.value!;

  const existingClasses = await prisma.class.findMany({ where: { id: { in: value.classIds } } });
  if (existingClasses.length !== value.classIds.length) {
    return res.status(400).json({ error: 'Invalid quiz', details: [{ field: 'classIds', message: 'One or more classes do not exist' }] });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.quizClass.deleteMany({ where: { quizId: quiz.id } });
    return tx.quiz.update({
      where: { id: quiz.id },
      data: {
        title: value.title,
        timeLimitMinutes: value.timeLimitMinutes,
        openAt: value.openAt,
        closeAt: value.closeAt,
        negativeMarking: value.negativeMarking,
        penaltyFraction: value.penaltyFraction,
        classes: { create: value.classIds.map((classId) => ({ classId })) },
      },
      include: quizListInclude,
    });
  });

  res.json({ quiz: quizListShape(updated) });
});

router.put('/quizzes/:id/questions', async (req, res) => {
  const quiz = await loadOwnedQuiz(req.params.id, req.user!);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

  if (await isQuizLocked(quiz.id)) {
    return res.status(409).json({ error: 'Quiz is locked: a student has already started it' });
  }

  const result = validateQuestions((req.body ?? {}).questions);
  if (!result.valid) {
    return res.status(400).json({ error: 'Invalid questions', details: result.errors });
  }
  const questions = result.value!;

  await prisma.$transaction(async (tx) => {
    await tx.question.deleteMany({ where: { quizId: quiz.id } });
    for (const q of questions) {
      await tx.question.create({
        data: {
          quizId: quiz.id,
          order: q.order,
          text: q.text,
          points: q.points,
          options: { create: q.options.map((o) => ({ order: o.order, text: o.text, isCorrect: o.isCorrect })) },
        },
      });
    }
  });

  const full = await prisma.quiz.findUniqueOrThrow({
    where: { id: quiz.id },
    include: { questions: { orderBy: { order: 'asc' }, include: { options: { orderBy: { order: 'asc' } } } } },
  });

  res.json({ questions: full.questions });
});

// A minimal per-quiz attempt list — just enough for Phase 4's demo (an auto-submitted attempt
// with a score, visible on reload). The full results roster (every target-class student
// including not-attempted, summary stats, per-question %, CSV export) is Phase 5.
router.get('/quizzes/:id/attempts', async (req, res) => {
  const quiz = await loadOwnedQuiz(req.params.id, req.user!);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

  const attempts = await prisma.attempt.findMany({
    where: { quizId: quiz.id },
    include: { student: { include: { user: true } } },
    orderBy: { startedAt: 'asc' },
  });

  // Lazy finalize-on-read (FR-025): reloading this page catches an expired attempt
  // immediately, without waiting for the sweep.
  const finalized = await Promise.all(attempts.map((a) => finalizeIfExpired(a)));

  res.json({
    attempts: finalized.map((attempt, i) => ({
      id: attempt.id,
      student: {
        studentId: attempts[i].student.studentId,
        nameAr: attempts[i].student.user.nameAr,
        nameEn: attempts[i].student.user.nameEn,
      },
      startedAt: attempt.startedAt,
      deadline: attempt.deadline,
      submittedAt: attempt.submittedAt,
      submissionType: attempt.submissionType,
      score: attempt.score,
    })),
  });
});

router.post('/quizzes/:id/publish', async (req, res) => {
  const quiz = await loadOwnedQuiz(req.params.id, req.user!);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

  const questionCount = await prisma.question.count({ where: { quizId: quiz.id } });
  if (questionCount === 0) {
    return res.status(400).json({ error: 'Cannot publish a quiz with no questions' });
  }

  const updated = await prisma.quiz.update({
    where: { id: quiz.id },
    data: { status: 'PUBLISHED' },
    include: quizListInclude,
  });

  res.json({ quiz: quizListShape(updated) });
});

export default router;
