import type { Page } from '@playwright/test';

export async function login(page: Page, username: string, password = 'password123'): Promise<void> {
  await page.goto('/login');
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}
