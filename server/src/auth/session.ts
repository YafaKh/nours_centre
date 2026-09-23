import { prisma } from '../db.js';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function sessionMaxAgeMs(): number {
  return SESSION_TTL_MS;
}

export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  return prisma.session.create({ data: { userId, expiresAt } });
}

export async function getValidSession(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session;
}

export async function deleteSession(sessionId: string) {
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
}

export async function deleteAllSessionsForUser(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}
