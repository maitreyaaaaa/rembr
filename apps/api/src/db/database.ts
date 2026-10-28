import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

export type DatabaseHandle = Database.Database;

const migrationsDirectory = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations');

export function createDatabase(databasePath = config.databasePath): DatabaseHandle {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  if (databasePath !== ':memory:') database.pragma('journal_mode = WAL');
  migrate(database);
  return database;
}

export function migrate(database: DatabaseHandle): void {
  database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const files = ['001_initial.sql', '002_phase2_account_library.sql', '003_phase3_ingestion_jobs.sql', '004_import_upload_chunks.sql', '005_import_integrity.sql', '006_import_leases.sql'];
  const hasMigration = database.prepare('SELECT 1 FROM schema_migrations WHERE name = ?');
  for (const name of files) {
    if (hasMigration.get(name)) continue;
    const sql = readFileSync(resolve(migrationsDirectory, name), 'utf8');
    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(sql);
      database.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)')
        .run(name, new Date().toISOString());
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
}

export function createTestDatabase(): DatabaseHandle {
  return createDatabase(':memory:');
}
