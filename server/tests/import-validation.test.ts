import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { createAdmin, loginAndGetCookie } from './helpers/quizFixtures.js';
import { buildCsvBuffer } from './helpers/importFixtures.js';

const app = createApp();
const PREFIX = 'import-validation-';

describe('students import validation (FR-052): bad field/class/name/duplicate ID rejects the whole file, persists nothing, and names row+field', () => {
  let adminCookie: string[];
  let className: string;

  beforeAll(async () => {
    const admin = await createAdmin({ username: `${PREFIX}admin@x.test` });
    adminCookie = await loginAndGetCookie(app, admin.username);
    className = `${PREFIX}class`;
    await prisma.class.create({ data: { name: className } });
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { username: { startsWith: PREFIX } } } });
    await prisma.student.deleteMany({ where: { studentId: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.class.deleteMany({ where: { name: className } });
  });

  it('rejects a row targeting a class that does not exist, and persists nothing from the file', async () => {
    const buffer = buildCsvBuffer([
      ['student_id', 'name_ar', 'name_en', 'class', 'email'],
      [`${PREFIX}s1`, 'سارة أحمد', 'Sara Ahmad', className, ''],
      [`${PREFIX}s2`, '', 'Omar Yousef', 'this-class-does-not-exist', ''],
    ]);

    const res = await request(app)
      .post('/api/admin/import/students')
      .set('Cookie', adminCookie)
      .attach('file', buffer, 'students.csv');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/validation failed/i);
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row: 2,
          field: 'row2.class',
          message: expect.stringContaining('this-class-does-not-exist does not exist'),
        }),
      ]),
    );

    // Row 1 was individually valid, but since the file fails as a whole nothing is saved.
    const s1 = await prisma.student.findUnique({ where: { studentId: `${PREFIX}s1` } });
    expect(s1).toBeNull();
  });

  it('rejects a duplicate student_id within the same file', async () => {
    const buffer = buildCsvBuffer([
      ['student_id', 'name_ar', 'name_en', 'class', 'email'],
      [`${PREFIX}dup`, '', 'First Row', className, ''],
      [`${PREFIX}dup`, '', 'Second Row', className, ''],
    ]);

    const res = await request(app)
      .post('/api/admin/import/students')
      .set('Cookie', adminCookie)
      .attach('file', buffer, 'students.csv');

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ row: 2, message: expect.stringContaining('duplicate student_id') })]),
    );
    const dup = await prisma.student.findUnique({ where: { studentId: `${PREFIX}dup` } });
    expect(dup).toBeNull();
  });

  it('rejects a row with neither name_ar nor name_en filled in', async () => {
    const buffer = buildCsvBuffer([
      ['student_id', 'name_ar', 'name_en', 'class', 'email'],
      [`${PREFIX}noname`, '', '', className, ''],
    ]);

    const res = await request(app)
      .post('/api/admin/import/students')
      .set('Cookie', adminCookie)
      .attach('file', buffer, 'students.csv');

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ row: 1, message: expect.stringContaining('at least one of name_ar or name_en') })]),
    );
  });

  it('rejects a name_ar field with no Arabic letters (FR-069: catches swapped columns)', async () => {
    const buffer = buildCsvBuffer([
      ['student_id', 'name_ar', 'name_en', 'class', 'email'],
      [`${PREFIX}swapped`, 'Sara Ahmad', 'سارة أحمد', className, ''],
    ]);

    const res = await request(app)
      .post('/api/admin/import/students')
      .set('Cookie', adminCookie)
      .attach('file', buffer, 'students.csv');

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 1, field: 'row1.name_ar', message: expect.stringContaining('must contain Arabic letters') }),
        expect.objectContaining({ row: 1, field: 'row1.name_en', message: expect.stringContaining('must contain Latin letters') }),
      ]),
    );
  });

  it('rejects a missing required column (student_id)', async () => {
    const buffer = buildCsvBuffer([
      ['student_id', 'name_ar', 'name_en', 'class', 'email'],
      ['', '', 'No ID', className, ''],
    ]);

    const res = await request(app)
      .post('/api/admin/import/students')
      .set('Cookie', adminCookie)
      .attach('file', buffer, 'students.csv');

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ row: 1, field: 'row1.student_id' })]),
    );
  });
});
