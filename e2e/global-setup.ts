import fs from 'node:fs';
import path from 'node:path';
import { request } from '@playwright/test';

// Logging in once per role here (instead of via the UI in every spec) keeps the whole e2e run
// well under the login route's rate limit (5 attempts / 10 min, server/src/auth/routes.ts) —
// these specs share one long-running dev server, so per-test UI logins would exhaust it fast.
const AUTH_DIR = path.join(__dirname, '.auth');
const BASE_URL = 'http://localhost:5173';

async function saveLogin(username: string, password: string, file: string): Promise<void> {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  const res = await ctx.post('/api/auth/login', { data: { username, password } });
  if (!res.ok()) {
    throw new Error(`global-setup: login failed for ${username} (${res.status()})`);
  }
  await ctx.storageState({ path: file });
  await ctx.dispose();
}

export default async function globalSetup(): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await saveLogin('1001', 'password123', path.join(AUTH_DIR, 'student.json'));
  await saveLogin('teacher@nourscentre.test', 'password123', path.join(AUTH_DIR, 'teacher.json'));
  await saveLogin('nour@nourscentre.test', 'password123', path.join(AUTH_DIR, 'admin.json'));
}
