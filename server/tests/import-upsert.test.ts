import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { createAdmin, loginAndGetCookie } from './helpers/quizFixtures.js';
import { buildCsvBuffer } from './helpers/importFixtures.js';

const app = createApp();
const PREFIX = 'import-upsert-';

describe('students import upsert (FR-053): re-import updates the changed row by student_id, never duplicates', () => {
  let adminCookie: string[];
  let classAName: string;
  let classBName: string;

  beforeAll(async () => {
    const admin = await createAdmin({ username: `${PREFIX}admin@x.test` });
    adminCookie = await loginAndGetCookie(app, admin.username);
    classAName = `${PREFIX}class-a`;
    classBName = `${PREFIX}class-b`;
    await prisma.class.create({ data: { name: classAName } });
    await prisma.class.create({ data: { name: classBName } });
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { username: { startsWith: PREFIX } } } });
    await prisma.student.deleteMany({ where: { studentId: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.class.deleteMany({ where: { name: { startsWith: PREFIX } } });
  });

  it('creates new students on first import, then updates only the changed row on re-import with no duplicates', async () => {
    const idA = `${PREFIX}s1`;
    const idB = `${PREFIX}s2`;

    const firstImport = await request(app)
      .post('/api/admin/import/students')
      .set('Cookie', adminCookie)
      .attach(
        'file',
        buildCsvBuffer([
          ['student_id', 'name_ar', 'name_en', 'class', 'email'],
          [idA, '', 'Student One', classAName, ''],
          [idB, '', 'Student Two', classAName, ''],
        ]),
        'students.csv',
      );
    expect(firstImport.status).toBe(200);
    expect(firstImport.body.created).toBe(2);
    expect(firstImport.body.updated).toBe(0);
    expect(firstImport.body.newPasswords).toHaveLength(2);

    const countAfterFirst = await prisma.student.count({ where: { studentId: { in: [idA, idB] } } });
    expect(countAfterFirst).toBe(2);

    const originalHash = (await prisma.user.findUnique({ where: { username: idB } }))!.passwordHash;

    // Re-import: only student A's class changed, student B's row is identical.
    const secondImport = await request(app)
      .post('/api/admin/import/students')
      .set('Cookie', adminCookie)
      .attach(
        'file',
        buildCsvBuffer([
          ['student_id', 'name_ar', 'name_en', 'class', 'email'],
          [idA, '', 'Student One', classBName, ''],
          [idB, '', 'Student Two', classAName, ''],
        ]),
        'students.csv',
      );
    expect(secondImport.status).toBe(200);
    expect(secondImport.body.created).toBe(0);
    expect(secondImport.body.updated).toBe(2);
    // Re-import never generates new passwords for already-existing students.
    expect(secondImport.body.newPasswords).toHaveLength(0);

    // Still exactly one row per student_id — no duplicates.
    const countAfterSecond = await prisma.student.count({ where: { studentId: { in: [idA, idB] } } });
    expect(countAfterSecond).toBe(2);

    const studentA = await prisma.student.findUnique({ where: { studentId: idA }, include: { class: true } });
    expect(studentA?.class.name).toBe(classBName);

    // Student B's row was untouched in content and its password/session were not reset.
    const userB = await prisma.user.findUnique({ where: { username: idB } });
    expect(userB?.passwordHash).toBe(originalHash);
  });
});
