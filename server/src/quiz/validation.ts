// Pure, framework-free validators for quiz authoring. Kept independent of Express/Prisma
// so they're trivially unit-testable and so Phase 6's spreadsheet import can reuse the
// question/option rules without duplicating them (DECISIONS.md §2 #8).

export interface QuizShellInput {
  title?: unknown;
  classIds?: unknown;
  timeLimitMinutes?: unknown;
  openAt?: unknown;
  closeAt?: unknown;
  negativeMarking?: unknown;
  penaltyFraction?: unknown;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult<T> {
  valid: boolean;
  errors: ValidationError[];
  value?: T;
}

export interface QuizShellValue {
  title: string;
  classIds: string[];
  timeLimitMinutes: number;
  openAt: Date;
  closeAt: Date;
  negativeMarking: boolean;
  penaltyFraction: number;
}

export function validateQuizShell(input: QuizShellInput): ValidationResult<QuizShellValue> {
  const errors: ValidationError[] = [];

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) errors.push({ field: 'title', message: 'Title is required' });

  const classIds = Array.isArray(input.classIds)
    ? input.classIds.filter((c): c is string => typeof c === 'string' && c.length > 0)
    : [];
  if (classIds.length === 0) {
    errors.push({ field: 'classIds', message: 'At least one target class is required' });
  }

  const timeLimitMinutes = Number(input.timeLimitMinutes);
  if (!Number.isFinite(timeLimitMinutes) || timeLimitMinutes <= 0) {
    errors.push({ field: 'timeLimitMinutes', message: 'Time limit must be a positive number of minutes' });
  }

  const openAt = parseDate(input.openAt);
  if (!openAt) errors.push({ field: 'openAt', message: 'Open date/time is required and must be valid' });

  const closeAt = parseDate(input.closeAt);
  if (!closeAt) errors.push({ field: 'closeAt', message: 'Close date/time is required and must be valid' });

  if (openAt && closeAt && openAt.getTime() >= closeAt.getTime()) {
    errors.push({ field: 'closeAt', message: 'Close date/time must be after open date/time' });
  }

  const negativeMarking = input.negativeMarking === true;
  let penaltyFraction = 0;
  if (negativeMarking) {
    penaltyFraction = Number(input.penaltyFraction);
    if (!Number.isFinite(penaltyFraction) || penaltyFraction <= 0 || penaltyFraction > 1) {
      errors.push({
        field: 'penaltyFraction',
        message: 'Penalty fraction must be a number greater than 0 and at most 1 when negative marking is on',
      });
    }
  }

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    errors: [],
    value: {
      title,
      classIds,
      timeLimitMinutes,
      openAt: openAt!,
      closeAt: closeAt!,
      negativeMarking,
      penaltyFraction,
    },
  };
}

export interface OptionInput {
  text?: unknown;
  isCorrect?: unknown;
}

export interface QuestionInput {
  text?: unknown;
  points?: unknown;
  options?: unknown;
}

export interface OptionValue {
  order: number;
  text: string;
  isCorrect: boolean;
}

export interface QuestionValue {
  order: number;
  text: string;
  points: number;
  options: OptionValue[];
}

/**
 * Validates the full question list for a quiz. Row numbers in error messages are 1-based
 * to match how they'll be shown to a user (matches FR-052's "Row 14: ..." convention).
 */
export function validateQuestions(input: unknown): ValidationResult<QuestionValue[]> {
  const errors: ValidationError[] = [];

  if (!Array.isArray(input) || input.length === 0) {
    return { valid: false, errors: [{ field: 'questions', message: 'At least one question is required' }] };
  }

  const questions: QuestionValue[] = [];

  input.forEach((raw, index) => {
    const row = index + 1;
    const q = (raw ?? {}) as QuestionInput;

    const text = typeof q.text === 'string' ? q.text.trim() : '';
    if (!text) errors.push({ field: `questions[${row}].text`, message: `Row ${row}: question text is required` });

    const points = Number(q.points);
    if (!Number.isFinite(points) || points <= 0) {
      errors.push({ field: `questions[${row}].points`, message: `Row ${row}: points must be a positive number` });
    }

    const rawOptions = Array.isArray(q.options) ? q.options : [];
    if (rawOptions.length !== 4) {
      errors.push({
        field: `questions[${row}].options`,
        message: `Row ${row}: exactly four options are required (got ${rawOptions.length})`,
      });
    }

    const options: OptionValue[] = rawOptions.map((raw, optIndex) => {
      const o = (raw ?? {}) as OptionInput;
      const optText = typeof o.text === 'string' ? o.text.trim() : '';
      if (!optText) {
        errors.push({
          field: `questions[${row}].options[${optIndex + 1}].text`,
          message: `Row ${row}, option ${optIndex + 1}: text is required`,
        });
      }
      return { order: optIndex, text: optText, isCorrect: o.isCorrect === true };
    });

    const correctCount = options.filter((o) => o.isCorrect).length;
    if (rawOptions.length === 4 && correctCount !== 1) {
      errors.push({
        field: `questions[${row}].options`,
        message: `Row ${row}: exactly one option must be marked correct (got ${correctCount})`,
      });
    }

    questions.push({ order: index, text, points: Number.isFinite(points) ? points : 0, options });
  });

  if (errors.length > 0) return { valid: false, errors };

  return { valid: true, errors: [], value: questions };
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
