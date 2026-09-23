import { Router, type Response } from 'express';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { prisma } from '../db.js';
import { hashPassword } from '../auth/hash.js';
import { deleteAllSessionsForUser } from '../auth/session.js';
import { buildTemplateXlsx, XLSX_CONTENT_TYPE } from '../import/columns.js';
import { ImportValidationError } from '../import/errors.js';
import { EmptyFileError } from '../import/parse.js';
import { STUDENT_COLUMNS, importStudents } from '../import/students.js';
import { TEACHER_COLUMNS, importTeachers } from '../import/teachers.js';
import { generateTempPassword } from '../import/tempPassword.js';
import { upload } from '../import/upload.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

router.get('/dashboard', (req, res) => {
  res.json({ user: req.user });
});

function handleImportError(err: unknown, res: Response) {
  if (err instanceof ImportValidationError) {
    return res.status(400).json({ error: 'Import validation failed', details: err.errors });
  }
  if (err instanceof EmptyFileError) {
    return res.status(400).json({ error: 'Invalid file', details: [{ row: 0, field: 'file', message: err.message }] });
  }
  console.error('import failed', err);
  return res.status(400).json({ error: 'Could not read the uploaded file. Make sure it is a valid CSV or XLSX file.' });
}

// FR-050/052/053/054: whole-file validation, all-or-nothing, upsert-by-student-id on re-import.
router.post('/import/students', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const summary = await importStudents(req.file.buffer);
    res.json(summary);
  } catch (err) {
    handleImportError(err, res);
  }
});

// FR-052a: header + example rows generated from the same column definitions importStudents
// validates against.
router.get('/import/students/template', (_req, res) => {
  const xlsx = buildTemplateXlsx(STUDENT_COLUMNS);
  res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
  res.setHeader('Content-Disposition', 'attachment; filename="students-template.xlsx"');
  res.send(xlsx);
});

router.post('/import/teachers', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const summary = await importTeachers(req.file.buffer);
    res.json(summary);
  } catch (err) {
    handleImportError(err, res);
  }
});

router.get('/import/teachers/template', (_req, res) => {
  const xlsx = buildTemplateXlsx(TEACHER_COLUMNS);
  res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
  res.setHeader('Content-Disposition', 'attachment; filename="teachers-template.xlsx"');
  res.send(xlsx);
});

// FR-054/A4: a simple student list (name, class, username) admin can browse before resetting
// a password. FR-067: admin tables show both name columns.
router.get('/students', async (_req, res) => {
  const students = await prisma.student.findMany({
    include: { user: true, class: true },
  });

  const rows = students
    .map((s) => ({
      id: s.id,
      studentId: s.studentId,
      nameAr: s.user.nameAr,
      nameEn: s.user.nameEn,
      className: s.class.name,
      username: s.user.username,
    }))
    .sort((a, b) => (a.nameEn || a.nameAr || a.studentId).localeCompare(b.nameEn || b.nameAr || b.studentId));

  res.json({ students: rows });
});

// FR-054/A4: generates a new temporary password, invalidates the student's existing session(s)
// immediately, and returns the new password once for the admin to hand out — it is never stored
// or shown again.
router.post('/students/:id/reset-password', async (req, res) => {
  const student = await prisma.student.findUnique({ where: { id: req.params.id }, include: { user: true } });
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const password = generateTempPassword();
  const passwordHash = await hashPassword(password);

  await prisma.user.update({ where: { id: student.userId }, data: { passwordHash } });
  await deleteAllSessionsForUser(student.userId);

  res.json({ studentId: student.studentId, username: student.user.username, password });
});

export default router;
