// FR-065/066/069: every person has name_ar + name_en, at least one required, and each field
// (when present) must actually contain letters of its own script — catches the two columns
// being swapped on import. Shared by the students and teachers importers so the rule can't
// drift between the two.

import type { RowError } from './columns.js';

const ARABIC_LETTER_RE = /[؀-ۿ]/;
const LATIN_LETTER_RE = /[A-Za-z]/;

export function validateNameFields(nameAr: string, nameEn: string, rowNum: number): RowError[] {
  const errors: RowError[] = [];

  if (!nameAr && !nameEn) {
    errors.push({
      row: rowNum,
      field: `row${rowNum}.name`,
      message: `Row ${rowNum}: at least one of name_ar or name_en is required`,
    });
    return errors;
  }

  if (nameAr && !ARABIC_LETTER_RE.test(nameAr)) {
    errors.push({
      row: rowNum,
      field: `row${rowNum}.name_ar`,
      message: `Row ${rowNum}: name_ar must contain Arabic letters (got "${nameAr}") — check the name_ar/name_en columns aren't swapped`,
    });
  }
  if (nameEn && !LATIN_LETTER_RE.test(nameEn)) {
    errors.push({
      row: rowNum,
      field: `row${rowNum}.name_en`,
      message: `Row ${rowNum}: name_en must contain Latin letters (got "${nameEn}") — check the name_ar/name_en columns aren't swapped`,
    });
  }

  return errors;
}
