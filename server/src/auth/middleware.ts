import type { NextFunction, Request, Response } from 'express';
import { getValidSession } from './session.js';

export type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';

export interface AuthedUser {
  id: string;
  role: Role;
  username: string;
  nameAr: string | null;
  nameEn: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

const SESSION_COOKIE = 'sid';

export { SESSION_COOKIE };

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.signedCookies?.[SESSION_COOKIE];
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const session = await getValidSession(sessionId);
  if (!session) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return res.status(401).json({ error: 'Session expired or invalid' });
  }

  req.user = {
    id: session.user.id,
    role: session.user.role as Role,
    username: session.user.username,
    nameAr: session.user.nameAr,
    nameEn: session.user.nameEn,
  };
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
