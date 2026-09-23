import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { prisma } from '../db.js';
import { computeDeadline } from '../quiz/deadline.js';
import { finalizeIfExpired, finalizeManually } from '../quiz/finalize.js';

const router = Router();
router.use(requireAuth, requireRole('STUDENT'));

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

// A quiz not targeting the student's class behaves exactly like a quiz that doesn't exist —
// mirrors loadOwnedQuiz's 404-not-403 pattern in routes/teacher.ts, so existence of other
// classes' quizzes is never confirmed to the student (FR-004).
async function loadClassQuiz(quizId: string, classId: string) {
  return prisma.quiz.findFirst({
    where: { id: quizId, status: 'PUBLISHED', classes: { some: { classId } } },
  });
}

async function loadStudent(userId: string) {
  return prisma.student.findUnique({ where: { userId } });
}

function windowStatus(quiz: { openAt: Date; closeAt: Date }, now: Date): 'UPCOMING' | 'OPEN' | 'CLOSED' {
  if (now < quiz.openAt) return 'UPCOMING';
  if (now > quiz.closeAt) return 'CLOSED';
  return 'OPEN';
}

// Never includes isCorrect (FR-028): correct answers are never sent before the attempt is
// submitted.
function attemptPayload(
  attempt: { id: string; startedAt: Date; deadline: Date; submittedAt: Date | null; submissionType: string | null; score: number | null },
  quiz: { id: string; title: string; timeLimitMinutes: number; negativeMarking: boolean; penaltyFraction: number },
  questions: { id: string; order: number; text: string; points: number; options: { id: string; order: number; text: string }[] }[],
  answers: { questionId: string; optionId: string }[],
) {
  return {
    id: attempt.id,
    quizId: quiz.id,
    title: quiz.title,
    timeLimitMinutes: quiz.timeLimitMinutes,
    negativeMarking: quiz.negativeMarking,
    penaltyFraction: quiz.penaltyFraction,
    startedAt: attempt.startedAt,
    deadline: attempt.deadline,
    submittedAt: attempt.submittedAt,
    submissionType: attempt.submissionType,
    score: attempt.score,
    questions: questions.map((q) => ({
      id: q.id,
      order: q.order,
      text: q.text,
      points: q.points,
      options: q.options.map((o) => ({ id: o.id, order: o.order, text: o.text })),
    })),
    answers: Object.fromEntries(answers.map((a) => [a.questionId, a.optionId])),
  };
}

// Kept from Phase 1's roles.test.ts regression check (any authenticated student route).
// Quiz-taking itself lives at /quizzes and /attempts below.
router.get('/dashboard', (req, res) => {
  res.json({ user: req.user });
});

// FR-002/S2: quizzes for the student's own class, open/upcoming/closed, with the student's
// own attempt status if one exists.
router.get('/quizzes', async (req, res) => {
  const student = await loadStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student profile not found' });

  const now = new Date();
  const quizzes = await prisma.quiz.findMany({
    where: { status: 'PUBLISHED', classes: { some: { classId: student.classId } } },
    include: { attempts: { where: { studentId: student.id } } },
    orderBy: { openAt: 'asc' },
  });

  // Lazy finalize-on-read (FR-025) so the dashboard reflects an expired attempt immediately,
  // without waiting for the sweep or a visit to the quiz-taking page.
  const finalizedAttempts = await Promise.all(
    quizzes.map((quiz) => (quiz.attempts[0] ? finalizeIfExpired(quiz.attempts[0]) : null)),
  );

  res.json({
    quizzes: quizzes.map((quiz, i) => {
      const attempt = finalizedAttempts[i];
      return {
        id: quiz.id,
        title: quiz.title,
        timeLimitMinutes: quiz.timeLimitMinutes,
        openAt: quiz.openAt,
        closeAt: quiz.closeAt,
        negativeMarking: quiz.negativeMarking,
        windowStatus: windowStatus(quiz, now),
        attempt: attempt
          ? {
              id: attempt.id,
              startedAt: attempt.startedAt,
              deadline: attempt.deadline,
              submittedAt: attempt.submittedAt,
              submissionType: attempt.submissionType,
              score: attempt.score,
            }
          : null,
      };
    }),
  });
});

// FR-020/021/022/024/027: get-or-create is what makes "start" and "resume on refresh" the
// same call — a reload just re-runs this and gets back the same attempt. The DB unique
// constraint (not this check) is what actually prevents a double attempt under concurrency;
// the P2002 catch below just turns the loser of that race into a normal 200 instead of an error.
router.post('/quizzes/:quizId/attempt', async (req, res) => {
  const student = await loadStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student profile not found' });

  const quiz = await loadClassQuiz(req.params.quizId, student.classId);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

  let attempt = await prisma.attempt.findUnique({
    where: { studentId_quizId: { studentId: student.id, quizId: quiz.id } },
  });

  if (!attempt) {
    const now = new Date();
    if (now < quiz.openAt || now > quiz.closeAt) {
      return res.status(409).json({ error: 'This quiz is not open right now' });
    }

    const deadline = computeDeadline(now, quiz.timeLimitMinutes, quiz.closeAt);
    try {
      attempt = await prisma.attempt.create({
        data: { studentId: student.id, quizId: quiz.id, startedAt: now, deadline },
      });
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
      attempt = await prisma.attempt.findUniqueOrThrow({
        where: { studentId_quizId: { studentId: student.id, quizId: quiz.id } },
      });
    }
  }

  // Lazy finalize-on-read (FR-025): this endpoint is also how the page resumes/polls, so an
  // expired attempt is caught here the instant it's read, not just by the sweep.
  attempt = await finalizeIfExpired(attempt);

  const [questions, answers] = await Promise.all([
    prisma.question.findMany({
      where: { quizId: quiz.id },
      orderBy: { order: 'asc' },
      include: { options: { orderBy: { order: 'asc' } } },
    }),
    prisma.answer.findMany({ where: { attemptId: attempt.id } }),
  ]);

  res.json(attemptPayload(attempt, quiz, questions, answers));
});

// FR-023/026: autosaved as soon as the student picks an option, rejected once the deadline
// (plus grace) has passed. Uses the same isPastDeadline helper Phase 4's submit/sweep will use.
router.put('/attempts/:attemptId/answers', async (req, res) => {
  const student = await loadStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student profile not found' });

  let attempt = await prisma.attempt.findUnique({ where: { id: req.params.attemptId } });
  if (!attempt || attempt.studentId !== student.id) {
    return res.status(404).json({ error: 'Attempt not found' });
  }

  // Lazy finalize-on-write (FR-025): a write against an expired attempt finalizes it here,
  // rather than merely rejecting the write and leaving it stale until the sweep runs.
  // Ignores any client-supplied timestamp in req.body entirely (SC-003) — only the server's
  // own clock, via isPastDeadline inside finalizeIfExpired, decides lateness.
  attempt = await finalizeIfExpired(attempt);

  if (attempt.submittedAt) {
    return res.status(409).json({ error: 'This attempt has already been submitted' });
  }

  const questionId = typeof req.body?.questionId === 'string' ? req.body.questionId : '';
  const optionId = typeof req.body?.optionId === 'string' ? req.body.optionId : '';
  if (!questionId || !optionId) {
    return res.status(400).json({ error: 'questionId and optionId are required' });
  }

  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { options: true },
  });
  if (!question || question.quizId !== attempt.quizId) {
    return res.status(400).json({ error: 'That question is not part of this attempt\'s quiz' });
  }

  const option = question.options.find((o) => o.id === optionId);
  if (!option) {
    return res.status(400).json({ error: 'That option is not part of this question' });
  }

  const answer = await prisma.answer.upsert({
    where: { attemptId_questionId: { attemptId: attempt.id, questionId } },
    create: { attemptId: attempt.id, questionId, optionId },
    update: { optionId },
  });

  res.json({ questionId: answer.questionId, optionId: answer.optionId, answeredAt: answer.answeredAt });
});

// FR-025/FR-073: manual submit. Ignores any client-supplied timestamp in req.body entirely
// (SC-003) — only the server's own clock decides whether this lands as MANUAL (on time) or is
// instead caught by finalizeIfExpired as AUTO (already past deadline by the time it arrives).
router.post('/attempts/:attemptId/submit', async (req, res) => {
  const student = await loadStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student profile not found' });

  let attempt = await prisma.attempt.findUnique({ where: { id: req.params.attemptId } });
  if (!attempt || attempt.studentId !== student.id) {
    return res.status(404).json({ error: 'Attempt not found' });
  }

  if (attempt.submittedAt) {
    return res.status(409).json({ error: 'This attempt has already been submitted' });
  }

  attempt = await finalizeIfExpired(attempt);
  if (!attempt.submittedAt) {
    attempt = await finalizeManually(attempt, new Date());
  }

  const quiz = await prisma.quiz.findUniqueOrThrow({ where: { id: attempt.quizId } });
  const [questions, answers] = await Promise.all([
    prisma.question.findMany({
      where: { quizId: quiz.id },
      orderBy: { order: 'asc' },
      include: { options: { orderBy: { order: 'asc' } } },
    }),
    prisma.answer.findMany({ where: { attemptId: attempt.id } }),
  ]);

  res.json(attemptPayload(attempt, quiz, questions, answers));
});

export default router;
