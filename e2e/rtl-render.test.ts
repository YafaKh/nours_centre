import path from 'node:path';
import { test, expect } from '@playwright/test';

// FR-061/062: direction is detected per text block, so a quiz can mix Arabic and English
// questions/options and each block renders in its own direction. The seeded "اختبار عام" quiz
// (server/sample-data/quiz-arabic-open-questions.csv) has questions built exactly for this:
// an Arabic question with English options, and an English question with Arabic options.
test.use({ storageState: path.join(__dirname, '.auth', 'student.json') });

test.describe('RTL/LTR per-block rendering (FR-061/062)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/student');
    await page.getByRole('link', { name: /اختبار عام/ }).click();
    await page.waitForURL('**/student/quizzes/**');
  });

  test('an Arabic question renders RTL while its English options render LTR', async ({ page }) => {
    const question = page.getByText('ما هي عاصمة إنجلترا؟', { exact: true });
    await expect(question).toBeVisible();
    await expect(question).toHaveCSS('direction', 'rtl');

    const option = page.getByText('London', { exact: true });
    await expect(option).toHaveCSS('direction', 'ltr');
  });

  test('an English question renders LTR while its Arabic options render RTL', async ({ page }) => {
    const question = page.getByText('Which of these words is Arabic for "book"?', { exact: true });
    await expect(question).toBeVisible();
    await expect(question).toHaveCSS('direction', 'ltr');

    const option = page.getByText('كتاب', { exact: true });
    await expect(option).toHaveCSS('direction', 'rtl');
  });
});
