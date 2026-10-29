import { randomUUID } from 'node:crypto';
import type { DatabaseHandle } from '../db/database.js';
import { checkPublicPage, type LinkHealthResult } from '../items/safe-fetch.js';

const RECHECK_AFTER_DAYS = 7;
const DEFAULT_PROBE_LIMIT = 10;
const MAX_PROBE_LIMIT = 20;
const DISPLAY_LIMIT = 8;

type LinkCandidate = { id: string; title: string; url: string };
type CheckRow = { id: string; item_id: string; status: 'ok' | 'broken' | 'unknown'; source_url: string; final_url: string | null; http_status: number | null; error_code: string; error_message: string; checked_at: string; title: string };

function publicCheck(row: CheckRow) {
  return { id: row.id, itemId: row.item_id, title: row.title, status: row.status, sourceUrl: row.source_url, finalUrl: row.final_url, httpStatus: row.http_status, errorCode: row.error_code, errorMessage: row.error_message, checkedAt: row.checked_at };
}

export function createLibraryLinkHealthRepository(database: DatabaseHandle, probe: typeof checkPublicPage = checkPublicPage) {
  return {
    async get(ownerId: string) {
      const [summary, brokenRows] = await Promise.all([
        database.prepare(`SELECT count(*) AS checked_items,
            count(*) FILTER (WHERE status='broken') AS broken_count,
            count(*) FILTER (WHERE status='unknown') AS unknown_count,
            max(checked_at) AS last_checked_at
          FROM link_health_checks WHERE owner_id=?`).get(ownerId) as Promise<{ checked_items: number; broken_count: number; unknown_count: number; last_checked_at: string | null }>,
        database.prepare(`SELECT checks.id,checks.item_id,checks.status,checks.source_url,checks.final_url,checks.http_status,
            checks.error_code,checks.error_message,checks.checked_at,COALESCE(saved_items.title_override,saved_items.title) AS title
          FROM link_health_checks checks
          JOIN saved_items ON saved_items.owner_id=checks.owner_id AND saved_items.id=checks.item_id
          WHERE checks.owner_id=? AND checks.status='broken'
          ORDER BY checks.checked_at DESC,checks.id LIMIT ?`).all(ownerId, DISPLAY_LIMIT) as Promise<CheckRow[]>,
      ]);
      return {
        checkedItems: Number(summary?.checked_items ?? 0),
        brokenCount: Number(summary?.broken_count ?? 0),
        unknownCount: Number(summary?.unknown_count ?? 0),
        lastCheckedAt: summary?.last_checked_at ?? null,
        brokenLinks: brokenRows.map(publicCheck),
      };
    },
    async check(ownerId: string, limit = DEFAULT_PROBE_LIMIT, now = new Date()) {
      const boundedLimit = Math.max(1, Math.min(Math.floor(limit) || DEFAULT_PROBE_LIMIT, MAX_PROBE_LIMIT));
      const cutoff = new Date(now.getTime() - RECHECK_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const candidates = await database.prepare(`SELECT saved_items.id,COALESCE(saved_items.title_override,saved_items.title) AS title,
            saved_items.original_url AS url
          FROM saved_items
          LEFT JOIN link_health_checks checks ON checks.owner_id=saved_items.owner_id AND checks.item_id=saved_items.id
          WHERE saved_items.owner_id=? AND saved_items.item_kind='page'
            AND (checks.id IS NULL OR checks.checked_at<=?)
          ORDER BY COALESCE(checks.checked_at,'') ASC,saved_items.created_at DESC,saved_items.id DESC LIMIT ?`).all(ownerId, cutoff, boundedLimit) as LinkCandidate[];
      const checked = [];
      for (const item of candidates) {
        let result: LinkHealthResult;
        try { result = await probe(item.url); }
        catch { result = { status: 'unknown', sourceUrl: item.url, finalUrl: '', httpStatus: null, errorCode: 'check_failed', errorMessage: 'This link could not be checked safely right now.', checkedAt: now.toISOString() }; }
        const id = randomUUID();
        const checkedAt = result.checkedAt || now.toISOString();
        await database.prepare(`INSERT INTO link_health_checks
            (id,owner_id,item_id,status,source_url,final_url,http_status,error_code,error_message,checked_at,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(owner_id,item_id) DO UPDATE SET status=excluded.status,source_url=excluded.source_url,
            final_url=excluded.final_url,http_status=excluded.http_status,error_code=excluded.error_code,
            error_message=excluded.error_message,checked_at=excluded.checked_at,updated_at=excluded.updated_at`)
          .run(id, ownerId, item.id, result.status, item.url, result.finalUrl || null, result.httpStatus, result.errorCode.slice(0, 80), result.errorMessage.slice(0, 200), checkedAt, now.toISOString(), now.toISOString());
        checked.push({ itemId: item.id, title: item.title, status: result.status, sourceUrl: item.url, finalUrl: result.finalUrl || null, httpStatus: result.httpStatus, errorCode: result.errorCode.slice(0, 80), errorMessage: result.errorMessage.slice(0, 200), checkedAt });
      }
      return checked;
    },
  };
}
