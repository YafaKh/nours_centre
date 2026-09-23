// Teacher import (FR-050/052/065-069). Column layout: name_ar, name_en, email. Teachers log in
// by email (FR-002), so email is required here (unlike the optional email on students). Kept
// idempotent by upserting on email — the same reasoning as FR-053 for students — so re-running
// the sample-data loader never errors on already-imported teachers.

import { prisma } from '../db.js';
import { hashPassword } from '../auth/hash.js';
import { requiredColumnErrors, type ImportColumn, type RowError } from './columns.js';
import { validateNameFields } from './nameValidation.js';
import { generateTempPassword } from './tempPassword.js';
import { parseSpreadsheet, type ParsedRow } from './parse.js';
import { ImportValidationError } from './errors.js';

export const TEACHER_COLUMNS: ImportColumn[] = [
  { key: 'name_ar', header: 'name_ar', required: false, example: ['محمد خالد', ''] },
  { key: 'name_en', header: 'name_en', required: false, example: ['', 'Layla Omar'] },
  { key: 'email', header: 'email', required: true, example: ['mohammad@nourscentre.test', 'layla@nourscentre.test'] },
];

export interface TeacherImportRow {
  nameAr: string;
  nameEn: string;
  email: string;
}

export function validateTeacherRows(rows: ParsedRow[]): { errors: RowError[]; value: TeacherImportRow[] } {
  const errors: RowError[] = [];
  const value: TeacherImportRow[] = [];
  const seenEmails = new Set<string>();

  rows.forEach((row, index) => {
    const rowNum = index + 1;
    errors.push(...requiredColumnErrors(row, rowNum, TEACHER_COLUMNS));

    const nameAr = row.name_ar ?? '';
    const nameEn = row.name_en ?? '';
    const email = (row.email ?? '').toLowerCase();

    errors.push(...validateNameFields(nameAr, nameEn, rowNum));

    if (email && !email.includes('@')) {
      errors.push({ row: rowNum, field: `row${rowNum}.email`, message: `Row ${rowNum}: email "${email}" does not look valid` });
    }
    if (email) {
      if (seenEmails.has(email)) {
        errors.push({ row: rowNum, field: `row${rowNum}.email`, message: `Row ${rowNum}: duplicate email "${email}" within this file` });
      }
      seenEmails.add(email);
    }

    value.push({ nameAr, nameEn, email });
  });

  return { errors, value };
}

export interface ImportTeachersSummary {
  created: number;
  updated: number;
  newPasswords: { email: string; password: string }[];
}

export async function importTeachers(buffer: Buffer): Promise<ImportTeachersSummary> {
  const rows = parseSpreadsheet(buffer);
  const { errors, value } = validateTeacherRows(rows);
  if (errors.length > 0) throw new ImportValidationError(errors);

  const existing = await prisma.teacher.findMany({
    where: { email: { in: value.map((v) => v.email) } },
    select: { email: true },
  });
  const existingEmails = new Set(existing.map((t) => t.email));

  const hashByEmail = new Map<string, { password: string; hash: string }>();
  for (const row of value) {
    if (!existingEmails.has(row.email)) {
      const password = generateTempPassword();
      hashByEmail.set(row.email, { password, hash: await hashPassword(password) });
    }
  }

  const newPasswords: ImportTeachersSummary['newPasswords'] = [];
  let created = 0;
  let updated = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const row of value) {
        if (existingEmails.has(row.email)) {
          const teacher = await tx.teacher.update({
            where: { email: row.email },
            data: {},
          });
          await tx.user.update({
            where: { id: teacher.userId },
            data: { nameAr: row.nameAr || null, nameEn: row.nameEn || null },
          });
          updated += 1;
        } else {
          const { password, hash } = hashByEmail.get(row.email)!;
          await tx.user.create({
            data: {
              username: row.email,
              passwordHash: hash,
              role: 'TEACHER',
              nameAr: row.nameAr || null,
              nameEn: row.nameEn || null,
              teacher: { create: { email: row.email } },
            },
          });
          newPasswords.push({ email: row.email, password });
          created += 1;
        }
      }
    },
    { timeout: 15_000 },
  );

  return { created, updated, newPasswords };
}
