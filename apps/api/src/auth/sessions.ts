import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { DatabaseHandle } from '../db/database.js';
import { config } from '../config.js';

const COOKIE_NAME = 'rembr_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const REMEMBERED_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REMEMBERED_SESSION_RENEWAL_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;

export interface AuthenticatedUser {
  id: string;
  email: string;
  accountStatus: 'active' | 'disabled';
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

function cookieOptions(maxAge: number) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: config.secureCookies, path: '/', maxAge };
}

export async function createSession(database: DatabaseHandle, userId: string, res: Response, rememberMe = false) {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const ttl = rememberMe ? REMEMBERED_SESSION_TTL_MS : SESSION_TTL_MS;
  await database.prepare(`INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)`)
    .run(randomUUID(), userId, digest(token), new Date(now.getTime() + ttl).toISOString(), now.toISOString());
  res.cookie(COOKIE_NAME, token, cookieOptions(ttl));
}

export async function destroySession(database: DatabaseHandle, req: Request, res: Response) {
  const token = getCookie(req, COOKIE_NAME);
  if (token) await database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token));
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: config.secureCookies, path: '/' });
}

export function requireUser(database: DatabaseHandle) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = getCookie(req, COOKIE_NAME);
    if (!token || token.length > 128) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in to continue.', requestId: req.requestId } });
      return;
    }
    const now = new Date().toISOString();
    const session = await database.prepare(`SELECT sessions.id AS "sessionId", sessions.created_at AS "createdAt",
      sessions.expires_at AS "expiresAt", users.id, users.email, users.account_status AS "accountStatus"
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
      .get(digest(token), now) as (AuthenticatedUser & { sessionId: string; createdAt: string; expiresAt: string }) | undefined;
    if (!session) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Your session expired. Sign in again.', requestId: req.requestId } });
      return;
    }
    if (session.accountStatus !== 'active') {
      res.status(403).json({ error: { code: 'account_disabled', message: 'This account is disabled.', requestId: req.requestId } });
      return;
    }

    const expiresAt = Date.parse(session.expiresAt);
    const createdAt = Date.parse(session.createdAt);
    const remainingLifetime = expiresAt - Date.now();
    const remembered = expiresAt - createdAt > SESSION_TTL_MS;
    if (remembered && remainingLifetime <= REMEMBERED_SESSION_RENEWAL_WINDOW_MS) {
      const renewedExpiry = new Date(Date.now() + REMEMBERED_SESSION_TTL_MS).toISOString();
      await database.prepare('UPDATE sessions SET expires_at = ? WHERE id = ? AND token_hash = ?')
        .run(renewedExpiry, session.sessionId, digest(token));
      res.cookie(COOKIE_NAME, token, cookieOptions(REMEMBERED_SESSION_TTL_MS));
    }

    req.user = { id: session.id, email: session.email, accountStatus: session.accountStatus };
    next();
  };
}
