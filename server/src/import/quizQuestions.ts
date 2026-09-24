// Quiz-question import (FR-055 / DECISIONS.md §2 #8). Column layout is fixed by the spec:
// question_no, question_text, option_a..d, correct (A-D), points. Rather than duplicating the
// "exactly four options, exactly one correct" rule, each row is converted into the same shape
// quiz/validation.ts's validateQuestions already checks, and that validator is reused as-is.

import { validateQuestions, type QuestionInput, type QuestionValue } from '../quiz/validation.js';
import { requiredColumnErrors, type ImportColumn, type RowError } from './columns.js';
import { parseSpreadsheet, type ParsedRow } from './parse.js';

export const QUIZ_QUESTION_COLUMNS: ImportColumn[] = [
  { key: 'question_no', header: 'question_no', required: true, example: ['1', '2'] },
  { key: 'question_text', header: 'question_text', required: true, example: ['What is 2 + 2?', 'What is the capital of Jordan?'] },
  { key: 'option_a', header: 'option_a', required: true, example: ['3', 'Amman'] },
  { key: 'option_b', header: 'option_b', required: true, example: ['4', 'Cairo'] },
  { key: 'option_c', header: 'option_c', required: true, example: ['5', 'Beirut'] },
  { key: 'option_d', header: 'option_d', required: true, example: ['6', 'Damascus'] },
  { key: 'correct', header: 'correct', required: true, example: ['B', 'A'] },
  { key: 'points', header: 'points', required: true, example: ['1', '1'] },
];

export function validateQuizQuestionRows(rows: ParsedRow[]): { errors: RowError[]; value?: QuestionValue[] } {
  const errors: RowError[] = [];
  const questionInputs: QuestionInput[] = [];

  rows.forEach((row, index) => {
    const rowNum = index + 1;
    errors.push(...requiredColumnErrors(row, rowNum, QUIZ_QUESTION_COLUMNS));

    const correctRaw = (row.correct ?? '').trim().toUpperCase();
    if (row.correct && !['A', 'B', 'C', 'D'].includes(correctRaw)) {
      errors.push({
        row: rowNum,
        field: `row${rowNum}.correct`,
        message: `Row ${rowNum}: correct must be one of A, B, C, D (got "${row.correct}")`,
      });
    }

    questionInputs.push({
      text: row.question_text ?? '',
      points: row.points,
      options: [
        { text: row.option_a ?? '', isCorrect: correctRaw === 'A' },
        { text: row.option_b ?? '', isCorrect: correctRaw === 'B' },
        { text: row.option_c ?? '', isCorrect: correctRaw === 'C' },
        { text: row.option_d ?? '', isCorrect: correctRaw === 'D' },
      ],
    });
  });

  // Column-level errors (missing fields, bad `correct`) are reported before handing off to
  // validateQuestions, so a row with a blank option isn't also reported as "wrong option count".
  if (errors.length > 0) return { errors };

  const result = validateQuestions(questionInputs);
  if (!result.valid) {
    return {
      errors: result.errors.map((e) => {
        const match = /^questions\[(\d+)\]/.exec(e.field);
        return { row: match ? Number(match[1]) : 0, field: e.field, message: e.message };
      }),
    };
  }
  return { errors: [], value: result.value };
}

export function parseQuizQuestionsFile(buffer: Buffer): { errors: RowError[]; value?: QuestionValue[] } {
  const rows = parseSpreadsheet(buffer);
  return validateQuizQuestionRows(rows);
}
