import { randomUUID } from 'node:crypto';
import express from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createMcpExpressApp, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { DatabaseHandle } from '../db/database.js';
import type { AssetStorage } from '../assets/storage.js';
import type { MediaStorage } from '../media/storage.js';
import { createAccountService } from '../account/service.js';
import { createLibraryService } from '../library/service.js';
import { CaptureError, validatePublicUrl } from '../items/safe-fetch.js';
import { config } from '../config.js';

const ACCESS_CLAIM = 'urn:rembr:access';
const MCP_AUDIT_NAME = 'mcp_tool_audit_events';

type MpcEnvironment = {
  authKitDomain: string;
  resourceUrl: string;
};

type McpIdentity = {
  ownerId: string;
  clientId: string;
  access: 'read' | 'read_write';
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      rembrMcpIdentity?: McpIdentity;
    }
  }
}

function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

function readAccessClaim(value: unknown): 'read' | 'read_write' | null {
  return value === 'read' || value === 'read_write' ? value : null;
}

function makeServer(identity: McpIdentity, database: DatabaseHandle, assetStorage: AssetStorage, mediaStorage: MediaStorage,
  validateUrl: typeof validatePublicUrl) {
  const server = new McpServer({ name: 'rembr', version: '1.0.0' });
  const library = createLibraryService(database, assetStorage, mediaStorage);
  const account = createAccountService(database, assetStorage);

  async function audited<T>(toolName: string, action: () => Promise<T>): Promise<T> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    await database.prepare(`INSERT INTO ${MCP_AUDIT_NAME}
      (id, owner_id, client_id, tool_name, status, created_at)
      VALUES (?, ?, ?, ?, 'started', ?)`)
      .run(id, identity.ownerId, identity.clientId, toolName, createdAt);
    try {
      const result = await action();
      const itemId = typeof result === 'object' && result !== null && 'itemId' in result && typeof result.itemId === 'string'
        ? result.itemId : null;
      try {
        await database.prepare(`UPDATE ${MCP_AUDIT_NAME} SET status='succeeded', item_id=?, completed_at=? WHERE id=?`)
          .run(itemId, new Date().toISOString(), id);
      } catch {
        console.error('mcp_audit_completion_failed', { auditId: id, toolName });
      }
      return result;
    } catch (cause) {
      try {
        await database.prepare(`UPDATE ${MCP_AUDIT_NAME} SET status='failed', completed_at=? WHERE id=?`)
          .run(new Date().toISOString(), id);
      } catch {
        console.error('mcp_audit_failure_update_failed', { auditId: id, toolName });
      }
      throw cause;
    }
  }

  server.registerTool('search_saved_items', {
    title: 'Search saved items',
    description: 'Search the signed-in Rembr user’s saved pages and notes.',
    inputSchema: z.object({ search: z.string().trim().max(120).default(''), limit: z.number().int().min(1).max(50).default(10) }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ search, limit }) => {
    try {
      const result = await audited('search_saved_items', () => library.list(identity.ownerId,
        { search, limit, sort: 'created_desc', matchMode: 'terms' }));
      return textResult(result);
    } catch {
      return errorResult('Rembr could not search the saved library.');
    }
  });

  server.registerTool('get_saved_item', {
    title: 'Get saved item',
    description: 'Read one saved page or note by its Rembr item ID.',
    inputSchema: z.object({ id: z.string().uuid() }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ id }) => {
    try {
      const item = await audited('get_saved_item', () => library.get(identity.ownerId, id));
      return item ? textResult(item) : errorResult('Saved item not found.');
    } catch {
      return errorResult('Rembr could not read that saved item.');
    }
  });

  server.registerTool('list_collections', {
    title: 'List collections',
    description: 'List the signed-in Rembr user’s collections and item counts.',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => {
    try {
      const collections = await audited('list_collections', () => database.prepare(`SELECT c.id,c.name,c.description,c.created_at AS "createdAt",
        count(ci.item_id)::int AS "itemCount" FROM collections c
        LEFT JOIN collection_items ci ON ci.owner_id=c.owner_id AND ci.collection_id=c.id
        WHERE c.owner_id=? GROUP BY c.id ORDER BY c.name`).all(identity.ownerId));
      return textResult({ collections });
    } catch {
      return errorResult('Rembr could not list collections.');
    }
  });

  if (identity.access === 'read_write') {
    server.registerTool('save_link', {
      title: 'Save a link to Rembr',
      description: 'Capture a public web page into the signed-in Rembr user’s library. This creates a saved item.',
      inputSchema: z.object({ url: z.string().trim().min(8).max(2048) }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ url }) => {
      try {
        const saved = await audited('save_link', async () => {
          if (!await account.hasProfile(identity.ownerId)) throw new Error('profile_incomplete');
          const validated = await validateUrl(url);
          validated.url.hash = '';
          const outcome = await library.createPage(identity.ownerId, url, validated.url.toString(), validated.url.hostname);
          if (!outcome.item) throw new Error('capture_result_missing');
          return { itemId: outcome.item.id, duplicate: outcome.duplicate, status: outcome.item.status, title: outcome.item.title };
        });
        return textResult(saved);
      } catch (cause) {
        if (cause instanceof CaptureError) return errorResult(cause.message);
        if (cause instanceof Error && cause.message === 'profile_incomplete') return errorResult('Complete your Rembr profile before saving links.');
        return errorResult('Rembr could not save that link.');
      }
    });
  }

  return server;
}

export function createWorkOSMcpApp(database: DatabaseHandle, assetStorage: AssetStorage, mediaStorage: MediaStorage,
  validateUrl: typeof validatePublicUrl = validatePublicUrl,
  environment: MpcEnvironment = { authKitDomain: config.WORKOS_AUTHKIT_DOMAIN!, resourceUrl: config.MCP_RESOURCE_URL! }) {
  const authKitOrigin = new URL(environment.authKitDomain).origin;
  const resource = new URL(environment.resourceUrl);
  const metadataUrl = getOAuthProtectedResourceMetadataUrl(resource);
  const jwks = createRemoteJWKSet(new URL('/oauth2/jwks', authKitOrigin));
  const localHosts = config.NODE_ENV === 'development' ? ['localhost', '127.0.0.1', '[::1]'] : [];
  const mcpApp = createMcpExpressApp({ host: '0.0.0.0', allowedHosts: [resource.hostname, ...localHosts], jsonLimit: '64kb' });
  let authMetadataCache: { expiresAt: number; body: unknown } | undefined;

  const resourceMetadataHandler: express.RequestHandler = (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ resource: environment.resourceUrl, authorization_servers: [authKitOrigin], bearer_methods_supported: ['header'] });
  };
  mcpApp.get('/.well-known/oauth-protected-resource', resourceMetadataHandler);
  const pathMetadataUrl = new URL(metadataUrl);
  mcpApp.get(pathMetadataUrl.pathname, resourceMetadataHandler);
  mcpApp.get('/.well-known/oauth-authorization-server', async (_req, res) => {
    try {
      if (!authMetadataCache || authMetadataCache.expiresAt <= Date.now()) {
        const response = await fetch(`${authKitOrigin}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(5_000) });
        if (!response.ok) throw new Error(`workos_metadata_failed_${response.status}`);
        authMetadataCache = { body: await response.json(), expiresAt: Date.now() + 5 * 60_000 };
      }
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(authMetadataCache.body);
    } catch {
      res.status(503).json({ error: 'authorization_metadata_unavailable' });
    }
  });

  const authenticate: express.RequestHandler = async (req, res, next) => {
    const metadata = `resource_metadata="${metadataUrl}"`;
    const authorization = req.get('authorization') ?? '';
    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match || match[1]!.length > 8192) {
      res.setHeader('WWW-Authenticate', `Bearer error="invalid_token", ${metadata}`);
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    try {
      const { payload } = await jwtVerify(match[1]!, jwks, { issuer: authKitOrigin, audience: environment.resourceUrl });
      if (typeof payload.sub !== 'string' || typeof payload.client_id !== 'string') throw new Error('invalid_claims');
      const access = readAccessClaim(payload[ACCESS_CLAIM]);
      if (!access) {
        res.setHeader('WWW-Authenticate', `Bearer error="insufficient_scope", ${metadata}`);
        res.status(403).json({ error: 'insufficient_scope' });
        return;
      }
      const owner = await database.prepare(`SELECT u.id FROM workos_mcp_user_links link
        JOIN users u ON u.id=link.owner_id WHERE link.workos_user_id=? AND u.account_status='active'`)
        .get(payload.sub) as { id: string } | undefined;
      if (!owner) {
        res.status(403).json({ error: 'user_not_linked' });
        return;
      }
      req.rembrMcpIdentity = { ownerId: owner.id, clientId: payload.client_id, access };
      next();
    } catch {
      res.setHeader('WWW-Authenticate', `Bearer error="invalid_token", ${metadata}`);
      res.status(401).json({ error: 'unauthorized' });
    }
  };

  const handlerForRequest = (identity: McpIdentity) => toNodeHandler(createMcpHandler(() =>
    makeServer(identity, database, assetStorage, mediaStorage, validateUrl)));
  mcpApp.all('/mcp', authenticate, (req, res, next) => {
    const identity = req.rembrMcpIdentity;
    if (!identity) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    void handlerForRequest(identity)(req, res, req.body).catch(next);
  });

  return mcpApp;
}
