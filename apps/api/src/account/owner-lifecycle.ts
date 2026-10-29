import type { DatabaseHandle } from '../db/database.js';

/** Serializes owner data writes with an account freeze or deletion transaction. */
export async function lockActiveOwner(database: DatabaseHandle, ownerId: string): Promise<boolean> {
  const owner = await database.prepare(`SELECT id FROM users WHERE id=? AND account_status='active' FOR UPDATE`).get(ownerId);
  return Boolean(owner);
}
