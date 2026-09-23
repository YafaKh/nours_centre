// Students import (FR-050/052/053/054/065-069). Column layout: student_id, name_ar, name_en,
// class, email. Re-import upserts by student_id rather than duplicating (FR-053); newly created
// students get a generated initial password the caller can hand out (FR-054).

import { prisma } from '../db.js';
import { hashPassword } from '../auth/hash.js';
import { requiredColumnErrors, type ImportColumn, type RowError } from './columns.js';
import { validateNameFields } from './nameValidation.js';
import { generateTempPassword } from './tempPassword.js';
import { parseSpreadsheet, type ParsedRow } from './parse.js';
import { ImportValidationError } from './errors.js';

export const STUDENT_COLUMNS: ImportColumn[] = [
  { key: 'student_id', header: 'student_id', required: true, example: ['1101', '1102'] },
  { key: 'name_ar', header: 'name_ar', required: false, example: ['سارة أحمد', ''] },
  { key: 'name_en', header: 'name_en', required: false, example: ['', 'Omar Yousef'] },
  { key: 'class', header: 'class', required: true, example: ['10A', '10A'] },
  { key: 'email', header: 'email', required: false, example: ['', ''] },
];

export interface StudentImportRow {
  studentId: string;
  nameAr: string;
  nameEn: string;
  className: string;
  classId: string;
  email: string;
}

export function validateStudentRows(
  rows: ParsedRow[],
  classIdByName: Map<string, string>,
): { errors: RowError[]; value: StudentImportRow[] } {
  const errors: RowError[] = [];
  const value: StudentImportRow[] = [];
  const seenIds = new Set<string>();

  rows.forEach((row, index) => {
    const rowNum = index + 1;
    errors.push(...requiredColumnErrors(row, rowNum, STUDENT_COLUMNS));

    const studentId = row.student_id ?? '';
    const nameAr = row.name_ar ?? '';
    const nameEn = row.name_en ?? '';
    const className = row.class ?? '';
    const email = row.email ?? '';

    errors.push(...validateNameFields(nameAr, nameEn, rowNum));

    if (studentId) {
      if (seenIds.has(studentId)) {
        errors.push({
          row: rowNum,
          field: `row${rowNum}.student_id`,
          message: `Row ${rowNum}: duplicate student_id "${studentId}" within this file`,
        });
      }
      seenIds.add(studentId);
    }

    let classId = '';
    if (className) {
      const found = classIdByName.get(className);
      if (!found) {
        errors.push({ row: rowNum, field: `row${rowNum}.class`, message: `Row ${rowNum}: class ${className} does not exist` });
      } else {
        classId = found;
      }
    }

    if (email && !email.includes('@')) {
      errors.push({ row: rowNum, field: `row${rowNum}.email`, message: `Row ${rowNum}: email "${email}" does not look valid` });
    }

    value.push({ studentId, nameAr, nameEn, className, classId, email });
  });

  return { errors, value };
}

export interface ImportStudentsSummary {
  created: number;
  updated: number;
  newPasswords: { studentId: string; username: string; password: string }[];
}

export async function importStudents(buffer: Buffer): Promise<ImportStudentsSummary> {
  const rows = parseSpreadsheet(buffer);
  const classes = await prisma.class.findMany();
  const classIdByName = new Map(classes.map((c) => [c.name, c.id]));

  const { errors, value } = validateStudentRows(rows, classIdByName);
  if (errors.length > 0) throw new ImportValidationError(errors);

  const existing = await prisma.student.findMany({
    where: { studentId: { in: value.map((v) => v.studentId) } },
    select: { studentId: true },
  });
  const existingIds = new Set(existing.map((s) => s.studentId));

  // Hashing happens outside the transaction so bcrypt's cost doesn't risk tripping Prisma's
  // transaction timeout on a large (real-world: ~300 row) import.
  const hashByStudentId = new Map<string, { password: string; hash: string }>();
  for (const row of value) {
    if (!existingIds.has(row.studentId)) {
      const password = generateTempPassword();
      hashByStudentId.set(row.studentId, { password, hash: await hashPassword(password) });
    }
  }

  const newPasswords: ImportStudentsSummary['newPasswords'] = [];
  let created = 0;
  let updated = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const row of value) {
        if (existingIds.has(row.studentId)) {
          const student = await tx.student.update({
            where: { studentId: row.studentId },
            data: { classId: row.classId, email: row.email || null },
          });
          await tx.user.update({
            where: { id: student.userId },
            data: { nameAr: row.nameAr || null, nameEn: row.nameEn || null },
          });
          updated += 1;
        } else {
          const { password, hash } = hashByStudentId.get(row.studentId)!;
          await tx.user.create({
            data: {
              username: row.studentId,
              passwordHash: hash,
              role: 'STUDENT',
              nameAr: row.nameAr || null,
              nameEn: row.nameEn || null,
              student: { create: { studentId: row.studentId, classId: row.classId, email: row.email || null } },
            },
          });
          newPasswords.push({ studentId: row.studentId, username: row.studentId, password });
          created += 1;
        }
      }
    },
    { timeout: 15_000 },
  );

  return { created, updated, newPasswords };
}
