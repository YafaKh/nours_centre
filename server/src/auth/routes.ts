import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db.js';
import { verifyPassword } from './hash.js';
import { createSession, deleteSession, sessionMaxAgeMs } from './session.js';
import { requireAuth, SESSION_COOKIE } from './middleware.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_LIMIT ?? 5),
  standardHeaders: true,
  legacyHeaders: false,
  // Rate-limit after N *failures* (PLAN.md Phase 1), not N attempts overall — a correct login
  // shouldn't spend down the same budget that's protecting against brute-forcing the password.
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Please try again later.' },
});

function cookieOptions() {
  return {
    httpOnly: true,
    signed: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: sessionMaxAgeMs(),
    path: '/',
  };
}

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const session = await createSession(user.id);
  res.cookie(SESSION_COOKIE, session.id, cookieOptions());
  res.json({
    user: {
      id: user.id,
      role: user.role,
      username: user.username,
      nameAr: user.nameAr,
      nameEn: user.nameEn,
    },
  });
});

router.post('/logout', requireAuth, async (req, res) => {
  const sessionId = req.signedCookies?.[SESSION_COOKIE];
  if (sessionId) {
    await deleteSession(sessionId);
  }
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
