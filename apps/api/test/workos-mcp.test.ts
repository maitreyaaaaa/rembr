import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import express from 'express';
import { test } from 'node:test';
import { LocalAssetStorage } from '../src/assets/storage.js';
import { createTestDatabase } from '../src/db/database.js';
import { LocalMediaStorage } from '../src/media/storage.js';
import { createWorkOSMcpApp } from '../src/mcp/routes.js';

test('WorkOS MCP metadata is discoverable and the endpoint challenges unauthenticated clients', async () => {
  const database = await createTestDatabase();
  const storagePath = await mkdtemp(join(tmpdir(), 'rembr-workos-mcp-'));
  const mcpApp = createWorkOSMcpApp(database, new LocalAssetStorage(storagePath), new LocalMediaStorage(storagePath), undefined, {
    authKitDomain: 'https://rembr-test.authkit.app',
    resourceUrl: 'http://127.0.0.1/mcp',
  });
  const app = express();
  app.use(mcpApp);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const metadataResponse = await fetch(`${baseUrl}/.well-known/oauth-protected-resource`);
    assert.equal(metadataResponse.status, 200);
    assert.deepEqual(await metadataResponse.json(), {
      resource: 'http://127.0.0.1/mcp',
      authorization_servers: ['https://rembr-test.authkit.app'],
      bearer_methods_supported: ['header'],
    });

    const mcpResponse = await fetch(`${baseUrl}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(mcpResponse.status, 401);
    assert.match(mcpResponse.headers.get('www-authenticate') ?? '', /resource_metadata=/);
    assert.deepEqual(await mcpResponse.json(), { error: 'unauthorized' });
  } finally {
    server.closeAllConnections();
    server.close();
    await database.close();
    await rm(storagePath, { recursive: true, force: true });
  }
});
