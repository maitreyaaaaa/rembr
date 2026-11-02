import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import type { DatabaseHandle } from '../db/database.js';
import { requireUser, type AuthenticatedUser } from './sessions.js';

export const API_KEY_SCOPES = ['library:read', 'library:write', 'collections:read'] as const;
export type ApiKeyScope = typeof API_KEY_SCOPES[number];

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKeyId?: string;
      apiKeyScopes?: ApiKeyScope[];
    }
  }
}

const digest = (secret: string) => createHash('sha256').update(secret).digest();
const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).max(API_KEY_SCOPES.length),
  expiresInDays: z.number().int().min(1).max(365).default(90),
}).strict();

function failure(res: express.Response, status: number, code: string, message: string, requestId?: string) {
  return res.status(status).json({ error: { code, message, ...(requestId ? { requestId } : {}) } });
}

export function createApiKeyRouter(database: DatabaseHandle) {
  const router = express.Router();
  const signedIn = requireUser(database);

  router.get('/developer-keys', signedIn, async (req, res) => {
    const rows = await database.prepare(`SELECT id,name,scopes_json AS "scopesJson",created_at AS "createdAt",
      expires_at AS "expiresAt",last_used_at AS "lastUsedAt",revoked_at AS "revokedAt",public_id AS "publicId"
      FROM personal_api_keys WHERE owner_id=? ORDER BY created_at DESC`).all(req.user!.id) as Array<Record<string, unknown>>;
    return res.json({ keys: rows.map((row) => ({
      id: String(row.id), name: String(row.name), scopes: parseScopes(String(row.scopesJson)),
      prefix: `rmb_live_${String(row.publicId)}_`, createdAt: String(row.createdAt), expiresAt: String(row.expiresAt),
      lastUsedAt: row.lastUsedAt ? String(row.lastUsedAt) : null, revokedAt: row.revokedAt ? String(row.revokedAt) : null,
    })) });
  });

  router.post('/developer-keys', signedIn, async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return failure(res, 400, 'invalid_api_key', 'Provide a name, at least one supported scope, and an expiry from 1 to 365 days.', req.requestId);
    const publicId = randomBytes(8).toString('hex');
    const secret = randomBytes(32).toString('base64url');
    const token = `rmb_live_${publicId}_${secret}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000).toISOString();
    await database.prepare(`INSERT INTO personal_api_keys
      (id,owner_id,public_id,name,secret_hash,scopes_json,created_at,expires_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(), req.user!.id, publicId, parsed.data.name, digest(secret).toString('hex'),
      JSON.stringify([...new Set(parsed.data.scopes)]), now.toISOString(), expiresAt);
    return res.status(201).json({ key: { token, prefix: `rmb_live_${publicId}_`, name: parsed.data.name,
      scopes: [...new Set(parsed.data.scopes)], expiresAt } });
  });

  router.delete('/developer-keys/:id', signedIn, async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const changed = await database.prepare(`UPDATE personal_api_keys SET revoked_at=?
      WHERE id=? AND owner_id=? AND revoked_at IS NULL`).run(new Date().toISOString(), id, req.user!.id);
    if (!changed.changes) return failure(res, 404, 'not_found', 'API key not found.', req.requestId);
    return res.status(204).end();
  });

  return router;
}

function parseScopes(raw: string): ApiKeyScope[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((scope): scope is ApiKeyScope => typeof scope === 'string' && (API_KEY_SCOPES as readonly string[]).includes(scope)) : [];
  } catch { return []; }
}

export function requireApiKey(database: DatabaseHandle, requiredScope: ApiKeyScope) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const [scheme, token, extra] = (req.get('authorization') ?? '').split(/\s+/);
    const match = scheme?.toLowerCase() === 'bearer' && !extra
      ? /^rmb_live_([a-f0-9]{16})_([A-Za-z0-9_-]{40,64})$/.exec(token ?? '') : null;
    if (!match) return failure(res, 401, 'unauthorized', 'A valid Rembr API key is required.', req.requestId);
    const [, publicId, secret] = match;
    const row = await database.prepare(`SELECT k.id,k.owner_id AS "ownerId",k.secret_hash AS "secretHash",
      k.scopes_json AS "scopesJson",k.expires_at AS "expiresAt",u.email,u.account_status AS "accountStatus"
      FROM personal_api_keys k JOIN users u ON u.id=k.owner_id
      WHERE k.public_id=? AND k.revoked_at IS NULL`).get(publicId) as {
        id: string; ownerId: string; secretHash: string; scopesJson: string; expiresAt: string; email: string; accountStatus: string;
      } | undefined;
    const actual = digest(secret!);
    const expected = Buffer.from(row?.secretHash ?? '0'.repeat(64), 'hex');
    const valid = expected.length === actual.length && timingSafeEqual(actual, expected);
    const expiry = row ? Date.parse(row.expiresAt) : Number.NaN;
    if (!row || !valid || !Number.isFinite(expiry) || expiry <= Date.now()) return failure(res, 401, 'unauthorized', 'A valid Rembr API key is required.', req.requestId);
    if (row.accountStatus !== 'active') return failure(res, 403, 'account_disabled', 'This account is disabled.', req.requestId);
    const scopes = parseScopes(row.scopesJson);
    if (!scopes.includes(requiredScope)) {
      res.setHeader('WWW-Authenticate', `Bearer error="insufficient_scope", scope="${requiredScope}"`);
      return failure(res, 403, 'insufficient_scope', `This key needs the ${requiredScope} scope.`, req.requestId);
    }
    req.user = { id: row.ownerId, email: row.email, accountStatus: 'active' } satisfies AuthenticatedUser;
    req.apiKeyId = row.id;
    req.apiKeyScopes = scopes;
    const lastUseCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await database.prepare(`UPDATE personal_api_keys SET last_used_at=? WHERE id=? AND (last_used_at IS NULL OR last_used_at<?)`)
      .run(new Date().toISOString(), row.id, lastUseCutoff);
    next();
  };
}
