import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 360, height: 740 } });

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

// FR-070: every student page works on a 360px phone without sideways scrolling.
test.describe('login page at 360px', () => {
  test('has no horizontal scroll', async ({ page }) => {
    await page.goto('/login');
    await expectNoHorizontalScroll(page);
  });
});

test.describe('quiz-taking at 360px (FR-070/FR-072)', () => {
  test.use({ storageState: path.join(__dirname, '.auth', 'student.json') });

  test('has no horizontal scroll, and the timer stays pinned to the top while scrolling', async ({ page }) => {
    await page.goto('/student');
    await expectNoHorizontalScroll(page);

    await page.getByRole('link', { name: /اختبار عام/ }).click();
    await page.waitForURL('**/student/quizzes/**');
    await expectNoHorizontalScroll(page);

    const timer = page.getByTestId('quiz-timer');
    await expect(timer).toBeVisible();

    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(150);
    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(scrollAfter).toBeGreaterThan(scrollBefore); // the page actually scrolled

    const box = await timer.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeLessThan(50); // still pinned near the top, not scrolled away with the content
  });
});

test.describe('teacher results at 360px', () => {
  test.use({ storageState: path.join(__dirname, '.auth', 'teacher.json') });

  test('has no horizontal scroll', async ({ page }) => {
    await page.goto('/teacher');
    await expectNoHorizontalScroll(page);

    await page.getByRole('link', { name: /الرياضيات/ }).click();
    await page.waitForURL('**/teacher/quizzes/**');
    await expectNoHorizontalScroll(page);

    await page.getByRole('link', { name: 'Full results' }).click();
    await page.waitForURL('**/results');
    await expectNoHorizontalScroll(page);
  });
});
