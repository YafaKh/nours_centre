import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');
const dbPath = path.resolve(serverRoot, 'prisma/test.db');

export default function setup() {
  for (const suffix of ['', '-journal']) {
    const target = dbPath + suffix;
    if (existsSync(target)) unlinkSync(target);
  }

  execSync('npx prisma migrate deploy', {
    cwd: serverRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
  });
}
