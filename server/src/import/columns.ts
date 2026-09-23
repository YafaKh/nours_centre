// Shared column-definition machinery for all three import types (students, teachers, quiz
// questions). One definition per type drives both the validator's required-field check and the
// "download template" endpoint (FR-052a / PLAN.md decision #9), so the two can't drift apart.

import * as XLSX from 'xlsx';

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface ImportColumn {
  /** Lowercased header key expected in the uploaded file, e.g. "student_id". */
  key: string;
  /** Header text as it appears in the file — currently identical to `key` for every column. */
  header: string;
  required: boolean;
  /** Example values for the template's example rows, one entry per example row. */
  example: string[];
}

export interface RowError {
  row: number;
  field: string;
  message: string;
}

/** Generic "this required column is blank" check, shared by every import type. */
export function requiredColumnErrors(row: Record<string, string>, rowNum: number, columns: ImportColumn[]): RowError[] {
  const errors: RowError[] = [];
  for (const col of columns) {
    if (col.required && !row[col.key]?.trim()) {
      errors.push({ row: rowNum, field: `row${rowNum}.${col.key}`, message: `Row ${rowNum}: ${col.header} is required` });
    }
  }
  return errors;
}

function templateRows(columns: ImportColumn[]): string[][] {
  const header = columns.map((c) => c.header);
  const exampleRowCount = Math.max(...columns.map((c) => c.example.length), 0);
  const rows = [header];
  for (let i = 0; i < exampleRowCount; i++) {
    rows.push(columns.map((c) => c.example[i] ?? ''));
  }
  return rows;
}

/** FR-052a: the exact header row the validator expects, plus one or two example rows, so a
 * user never has to guess the column layout — as a real .xlsx workbook (the importer's upload
 * side already accepts both CSV and XLSX via parseSpreadsheet, so the template can be
 * whichever format is friendliest to fill in). */
export function buildTemplateXlsx(columns: ImportColumn[]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(templateRows(columns));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Template');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
