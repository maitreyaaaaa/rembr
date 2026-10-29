import express from 'express';
import type { DatabaseHandle } from '../db/database.js';
import { requireUser } from '../auth/sessions.js';
import { createProfileGate } from '../account/routes.js';
import type { AssetStorage } from '../assets/storage.js';
import { createLibraryCheckupRepository } from './checkup.js';
import { createKnowledgeGraphRepository } from './graph.js';
import { createLibraryService } from '../library/service.js';
import { z } from 'zod';

export function createKnowledgeRouter(database: DatabaseHandle, storage: AssetStorage) {
  const router = express.Router();
  const signedIn = requireUser(database);
  const profile = createProfileGate(database, storage);
  const graph = createKnowledgeGraphRepository(database);
  const checkup = createLibraryCheckupRepository(database);
  const library = createLibraryService(database, storage);

  router.get('/knowledge/graph', signedIn, profile, async (req, res) => {
    return res.json({ graph: await graph.get(req.user!.id) });
  });

  router.get('/knowledge/checkup', signedIn, profile, async (req, res) => {
    return res.json({ checkup: await checkup.get(req.user!.id) });
  });

  router.post('/knowledge/answer', signedIn, profile, async (req, res) => {
    const parsed = z.object({ question: z.string().trim().min(1).max(120) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { code: 'invalid_question', message: 'Enter a question up to 120 characters.', requestId: req.requestId } });
    const result = await library.list(req.user!.id, { search: parsed.data.question, sort: 'relevance', matchMode: 'phrase', limit: 8 });
    const citations = result.items.map((item) => ({
      id: item.id, title: item.title, snippet: item.textPreview || item.description || item.title,
    }));
    const answer = citations.length
      ? `I found ${citations.length} saved ${citations.length === 1 ? 'item' : 'items'} that match this phrase. The excerpts below are saved library text; this preview does not generate or infer additional facts.`
      : 'I could not find a saved item with that phrase. Try a shorter phrase or different keywords.';
    return res.json({ question: parsed.data.question, answer, citations, resultIds: citations.map((citation) => citation.id), searchEventId: result.searchEventId, mode: 'lexical-excerpts' });
  });

  return router;
}
