// Shared by the manual question editor (PUT /quizzes/:id/questions) and the spreadsheet
// importer (POST /quizzes/:id/questions/import) — both fully replace a quiz's question set in
// one transaction, so this logic lives in exactly one place.

import { prisma } from '../db.js';
import type { QuestionValue } from './validation.js';

export async function replaceQuizQuestions(quizId: string, questions: QuestionValue[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.question.deleteMany({ where: { quizId } });
    for (const q of questions) {
      await tx.question.create({
        data: {
          quizId,
          order: q.order,
          text: q.text,
          points: q.points,
          options: { create: q.options.map((o) => ({ order: o.order, text: o.text, isCorrect: o.isCorrect })) },
        },
      });
    }
  });
}
