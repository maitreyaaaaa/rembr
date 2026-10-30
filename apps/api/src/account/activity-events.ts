import { randomUUID } from 'node:crypto';
import type { DatabaseHandle } from '../db/database.js';

export const ACCOUNT_ACTIVITY_EVENT_TYPES = [
  'data_export_requested', 'data_export_ready', 'data_export_failed',
  'data_export_cancelled', 'data_export_retried', 'data_export_downloaded',
  'import_started', 'import_completed', 'import_failed', 'import_status_changed',
  'background_job_failed', 'background_job_blocked', 'background_job_retrying',
  'search_failed', 'analysis_used',
] as const;

export type AccountActivityEventType = typeof ACCOUNT_ACTIVITY_EVENT_TYPES[number];

// Activity rows intentionally store only an allowlisted event name and timestamp.
// Avoid adding raw content, queries, filenames, provider payloads, or object IDs.
export async function recordAccountActivityEvent(database: DatabaseHandle, ownerId: string,
  eventType: AccountActivityEventType, createdAt = new Date().toISOString()): Promise<void> {
  await database.prepare(`INSERT INTO account_activity_events (id,owner_id,event_type,created_at) VALUES (?,?,?,?)`)
    .run(randomUUID(), ownerId, eventType, createdAt);
}
