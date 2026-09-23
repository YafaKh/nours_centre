import path from 'node:path';
import { test, expect } from '@playwright/test';
import { login } from './helpers';

const AUTH_DIR = path.join(__dirname, '.auth');

interface AdminStudentRow {
  studentId: string;
  nameAr: string | null;
  nameEn: string | null;
}

function displayName(nameEn: string | null, nameAr: string | null, fallback: string): string {
  return nameEn || nameAr || fallback;
}

// FR-067/068: teacher/admin tables show both name columns; everywhere else shows name_en, else
// name_ar; search looks in both fields; sorting uses the displayed name.
test.describe('admin students table (FR-064/067/068)', () => {
  test.use({ storageState: path.join(AUTH_DIR, 'admin.json') });

  test('shows both name columns, sorted by displayed name', async ({ page }) => {
    await page.goto('/admin/students');

    await expect(page.getByRole('columnheader', { name: 'Name (Arabic)' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Name (English)' })).toBeVisible();

    // Documented student's row shows both names, not a fallback to a single field.
    const row = page.getByRole('row', { name: /1001/ });
    await expect(row.getByRole('cell').nth(0)).toHaveText('سارة الحسن');
    await expect(row.getByRole('cell').nth(1)).toHaveText('Sara Hassan');

    const apiRes = await page.request.get('/api/admin/students');
    const { students }: { students: AdminStudentRow[] } = await apiRes.json();
    const names = students.map((s) => displayName(s.nameEn, s.nameAr, s.studentId));
    const expectedOrder = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(expectedOrder); // server sorts by displayed name (FR-068)

    // The DOM renders in the same (sorted) order the API returned it, unfiltered.
    const domEnglishNames = await page.locator('tbody tr td:nth-child(2)').allTextContents();
    expect(domEnglishNames.slice(0, 5)).toEqual(students.slice(0, 5).map((s) => s.nameEn || '—'));
  });

  test('search finds students by Arabic or English name (FR-064)', async ({ page }) => {
    await page.goto('/admin/students');
    const search = page.getByPlaceholder('Search by name, student ID, or class');

    await search.fill('Sara Hassan');
    await expect(page.getByRole('row', { name: /1001/ })).toBeVisible();

    await search.fill('سارة الحسن');
    await expect(page.getByRole('row', { name: /1001/ })).toBeVisible();

    await search.fill('no-such-student-xyz');
    await expect(page.getByText('No students found.')).toBeVisible();
  });
});

test.describe('teacher results table (FR-067)', () => {
  test.use({ storageState: path.join(AUTH_DIR, 'teacher.json') });

  test('shows both name columns', async ({ page }) => {
    await page.goto('/teacher');
    await page.getByRole('link', { name: /الرياضيات/ }).click();
    await page.waitForURL('**/teacher/quizzes/**');
    await page.getByRole('link', { name: 'Full results' }).click();
    await page.waitForURL('**/results');

    await expect(page.getByRole('columnheader', { name: 'Name (Arabic)' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Name (English)' })).toBeVisible();
  });
});

test('header shows name_en when it is set (FR-066/067)', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: path.join(AUTH_DIR, 'student.json') });
  const page = await ctx.newPage();
  await page.goto('/student');
  await expect(page.getByText('Sara Hassan')).toBeVisible();
  await ctx.close();
});

test('header falls back to name_ar when name_en is missing (FR-066/067)', async ({ browser }) => {
  // Student 1004 (server/sample-data/students.csv) has only name_ar. Reset their password (a
  // real admin feature) in an isolated admin context, then log in as them in a separate,
  // isolated context — leaves the shared admin/student storageState files untouched for other
  // specs in this run.
  const adminCtx = await browser.newContext({ storageState: path.join(AUTH_DIR, 'admin.json') });
  const adminPage = await adminCtx.newPage();
  await adminPage.goto('/admin/students');
  await adminPage.getByPlaceholder('Search by name, student ID, or class').fill('1004');
  const row = adminPage.getByRole('row', { name: /1004/ });
  await row.getByRole('button', { name: 'Reset password' }).click();
  const password = (await adminPage.locator('span.font-mono.font-semibold').textContent())?.trim();
  expect(password).toBeTruthy();
  await adminCtx.close();

  const studentCtx = await browser.newContext();
  const studentPage = await studentCtx.newPage();
  await login(studentPage, '1004', password!);
  await studentPage.waitForURL('**/student');
  await expect(studentPage.getByText('محمد حسين')).toBeVisible();
  await studentCtx.close();
});
