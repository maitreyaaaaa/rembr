import express from 'express';
import type { DatabaseHandle } from '../db/database.js';
import { requireUser } from '../auth/sessions.js';
import { createProfileGate } from '../account/routes.js';
import type { AssetStorage } from '../assets/storage.js';
import { createLibraryCheckupRepository } from './checkup.js';
import { createKnowledgeGraphRepository } from './graph.js';

export function createKnowledgeRouter(database: DatabaseHandle, storage: AssetStorage) {
  const router = express.Router();
  const signedIn = requireUser(database);
  const profile = createProfileGate(database, storage);
  const graph = createKnowledgeGraphRepository(database);
  const checkup = createLibraryCheckupRepository(database);

  router.get('/knowledge/graph', signedIn, profile, async (req, res) => {
    return res.json({ graph: await graph.get(req.user!.id) });
  });

  router.get('/knowledge/checkup', signedIn, profile, async (req, res) => {
    return res.json({ checkup: await checkup.get(req.user!.id) });
  });

  return router;
}
