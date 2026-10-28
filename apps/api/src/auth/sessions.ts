import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { DatabaseHandle } from '../db/database.js';
import { config } from '../config.js';

const COOKIE_NAME = 'rembr_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface AuthenticatedUser {
  id: string;
  email: string;
}

declare global {
  // Express uses declaration merging for request-scoped authenticated identity.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      requestId?: string;
    }
  }
}

function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function getCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function cookieOptions() {
  return { httpOnly: true, sameSite: 'lax' as const, secure: config.secureCookies, path: '/', maxAge: SESSION_TTL_MS };
}

export function createSession(database: DatabaseHandle, userId: string, res: Response): void {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  database.prepare(`INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)`)
    .run(randomUUID(), userId, digest(token), new Date(now.getTime() + SESSION_TTL_MS).toISOString(), now.toISOString());
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

export function destroySession(database: DatabaseHandle, req: Request, res: Response): void {
  const token = getCookie(req, COOKIE_NAME);
  if (token) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token));
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: config.secureCookies, path: '/' });
}

export function requireUser(database: DatabaseHandle) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = getCookie(req, COOKIE_NAME);
    if (!token || token.length > 128) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in to continue.', requestId: req.requestId } });
      return;
    }
    const now = new Date().toISOString();
    const user = database.prepare(`SELECT users.id, users.email
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
      .get(digest(token), now) as AuthenticatedUser | undefined;
    if (!user) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Your session expired. Sign in again.', requestId: req.requestId } });
      return;
    }
    req.user = user;
    next();
  };
}
