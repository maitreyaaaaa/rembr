import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { DatabaseHandle } from '../db/database.js';
import { config } from '../config.js';
import { lockActiveOwner } from '../account/owner-lifecycle.js';

const COOKIE_NAME = 'rembr_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_EXPIRED_SESSION_CLEANUP_BATCH = 500;

export async function cleanupExpiredSessions(database: DatabaseHandle, now = new Date(), limit = MAX_EXPIRED_SESSION_CLEANUP_BATCH): Promise<number> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_EXPIRED_SESSION_CLEANUP_BATCH) {
    throw new TypeError(`Expired-session cleanup limit must be between 1 and ${MAX_EXPIRED_SESSION_CLEANUP_BATCH}.`);
  }
  const result = await database.prepare(`WITH expired AS MATERIALIZED (
    SELECT id FROM sessions WHERE expires_at<=? ORDER BY expires_at,id LIMIT ?
  ) DELETE FROM sessions WHERE id IN (SELECT id FROM expired)`).run(now.toISOString(), limit);
  return result.changes;
}

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

function cookieOptions() {
  return { httpOnly: true, sameSite: 'lax' as const, secure: config.secureCookies, path: '/', maxAge: SESSION_TTL_MS };
}

export async function createSession(database: DatabaseHandle, userId: string, res: Response) {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  await database.transaction(async () => {
    if (!await lockActiveOwner(database, userId)) throw new Error('account_inactive');
    await database.prepare(`INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)`)
      .run(randomUUID(), userId, digest(token), new Date(now.getTime() + SESSION_TTL_MS).toISOString(), now.toISOString());
  })();
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

export async function destroySession(database: DatabaseHandle, req: Request, res: Response): Promise<string | null> {
  const token = getCookie(req, COOKIE_NAME);
  let userId: string | null = null;
  if (token) {
    userId = (await database.prepare('SELECT user_id FROM sessions WHERE token_hash=?').get(digest(token)) as { user_id: string } | undefined)?.user_id ?? null;
    await database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token));
  }
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: config.secureCookies, path: '/' });
  return userId;
}

export function requireUser(database: DatabaseHandle) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = getCookie(req, COOKIE_NAME);
    if (!token || token.length > 128) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in to continue.', requestId: req.requestId } });
      return;
    }
    const now = new Date().toISOString();
    const user = await database.prepare(`SELECT users.id, users.email, users.account_status AS "accountStatus"
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
      .get(digest(token), now) as AuthenticatedUser | undefined;
    if (!user) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Your session expired. Sign in again.', requestId: req.requestId } });
      return;
    }
    if (user.accountStatus !== 'active') {
      res.status(403).json({ error: { code: 'account_disabled', message: 'This account is disabled.', requestId: req.requestId } });
      return;
    }
    req.user = user;
    next();
  };
}

/** Allows an active owner or a frozen owner with a live, cancelable deletion request to view/cancel it. */
export function requireAccountLifecycleUser(database: DatabaseHandle) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = getCookie(req, COOKIE_NAME);
    if (!token || token.length > 128) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in to continue.', requestId: req.requestId } });
      return;
    }
    const now = new Date().toISOString();
    const user = await database.prepare(`SELECT users.id, users.email, users.account_status AS "accountStatus"
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
      .get(digest(token), now) as AuthenticatedUser | undefined;
    if (!user) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Your session expired or is no longer authorized.', requestId: req.requestId } });
      return;
    }
    if (user.accountStatus !== 'active') {
      const deletion = await database.prepare(`SELECT 1 FROM account_deletion_requests
        WHERE owner_id=? AND status IN ('pending_approval','approved','processing','partial_failed','failed') LIMIT 1`)
        .get(user.id);
      if (!deletion) {
        res.status(403).json({ error: { code: 'account_disabled', message: 'This account is disabled.', requestId: req.requestId } });
        return;
      }
    }
    req.user = user;
    next();
  };
}
