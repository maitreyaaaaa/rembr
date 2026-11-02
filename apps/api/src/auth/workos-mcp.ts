import express from 'express';
import { z } from 'zod';
import type { DatabaseHandle } from '../db/database.js';
import { config } from '../config.js';
import { requireUser } from './sessions.js';

const completeSchema = z.object({
  externalAuthId: z.string().trim().min(8).max(255),
  access: z.enum(['read', 'read_write']),
}).strict();
const ACCESS_CLAIM = 'urn:rembr:access';

function workosHeaders() {
  return {
    Authorization: `Bearer ${config.WORKOS_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function workosJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`workos_request_failed_${response.status}`);
  return response.json() as Promise<T>;
}

export function createWorkOSMcpAuthRouter(database: DatabaseHandle) {
  const router = express.Router();

  router.post('/auth/workos-mcp/complete', requireUser(database), async (req, res, next) => {
    const parsed = completeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'invalid_mcp_auth', message: 'The MCP sign-in request is invalid.', requestId: req.requestId } });
      return;
    }
    if (!config.WORKOS_API_KEY || !config.WORKOS_AUTHKIT_DOMAIN) {
      res.status(503).json({ error: { code: 'mcp_auth_unavailable', message: 'MCP authorization is not configured.', requestId: req.requestId } });
      return;
    }

    try {
      const complete = await workosJson<{ redirect_uri?: string }>('https://api.workos.com/authkit/oauth2/complete', {
        method: 'POST',
        headers: workosHeaders(),
        body: JSON.stringify({
          external_auth_id: parsed.data.externalAuthId,
          user: { id: req.user!.id, email: req.user!.email },
          user_consent_options: [{
            claim: ACCESS_CLAIM,
            type: 'enum',
            label: 'Rembr access',
            choices: [parsed.data.access === 'read'
              ? { value: 'read', label: 'Read saved items and collections' }
              : { value: 'read_write', label: 'Read saved items and collections, and save links' }],
          }],
        }),
      });

      if (!complete.redirect_uri) throw new Error('workos_redirect_missing');
      const redirect = new URL(complete.redirect_uri);
      const authKitOrigin = new URL(config.WORKOS_AUTHKIT_DOMAIN).origin;
      if (redirect.origin !== authKitOrigin || redirect.protocol !== 'https:') throw new Error('workos_redirect_invalid');

      const workosUser = await workosJson<{ id?: string; external_id?: string }>(
        `https://api.workos.com/user_management/users/external_id/${encodeURIComponent(req.user!.id)}`,
        { method: 'GET', headers: workosHeaders() },
      );
      if (!workosUser.id || workosUser.external_id !== req.user!.id) throw new Error('workos_user_link_invalid');

      await database.prepare(`INSERT INTO workos_mcp_user_links (workos_user_id, owner_id, created_at)
        VALUES (?, ?, ?) ON CONFLICT (workos_user_id) DO UPDATE SET owner_id=EXCLUDED.owner_id`)
        .run(workosUser.id, req.user!.id, new Date().toISOString());
      const linked = await database.prepare(`SELECT owner_id AS "ownerId" FROM workos_mcp_user_links WHERE workos_user_id=?`)
        .get(workosUser.id) as { ownerId: string } | undefined;
      if (linked?.ownerId !== req.user!.id) throw new Error('workos_user_link_conflict');

      res.setHeader('Cache-Control', 'no-store');
      res.json({ redirectUri: redirect.toString() });
    } catch (cause) {
      console.error('workos_mcp_auth_failed', { requestId: req.requestId, errorType: cause instanceof Error ? cause.message : 'unknown' });
      next(cause);
    }
  });

  return router;
}
