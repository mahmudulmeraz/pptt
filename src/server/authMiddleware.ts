import type { NextFunction, Request, Response } from 'express';
import type { User } from '@prisma/client';
import { prisma } from './db.ts';
import { verifySessionToken } from './crypto.ts';

export const SESSION_COOKIE_NAME = 'pp_session';

export interface AuthenticatedRequest extends Request {
  sessionUser?: User;
}

export async function getSessionUserFromRequest(req: Request): Promise<User | null> {
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;

  const token = bearerToken || cookieToken;
  const payload = verifySessionToken(token);
  if (!payload) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
  });
  return user;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = await getSessionUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required. Please connect with Facebook.' });
    return;
  }
  req.sessionUser = user;
  next();
}
