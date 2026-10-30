import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { lockActiveOwner, OwnerLifecycleError, withOwnerWorkLease } from './owner-lifecycle.js';
import type { DatabaseHandle } from '../db/database.js';
import { ACCOUNT_OWNER_TABLES, createAccountDataMapService } from './data-map-service.js';
import { recordAccountActivityEvent } from './activity-events.js';
import { ACCOUNT_EXPORT_FIELD_POLICY } from './account-export-field-policy.js';

export const ACCOUNT_DATA_EXPORT_LIMITS = {
  maxAttempts: 3,
  leaseMs: 15 * 60_000,
  retentionMs: 7 * 24 * 60 * 60_000,
  maxRows: 20_000,
  maxJsonBytes: 32 * 1024 * 1024,
  maxFiles: 200,
  maxSingleFileBytes: 25 * 1024 * 1024,
  maxTotalFileBytes: 100 * 1024 * 1024,
  maxArchiveBytes: 128 * 1024 * 1024,
  readBatchSize: 50,
} as const;

export type PrivateExportFileKind = 'asset' | 'import' | 'media';
export interface PrivateExportFileReference {
  ownerId: string;
  kind: PrivateExportFileKind;
  key: string;
  fileName: string;
  contentType: string;
  byteSize: number;
}

export interface OwnerScopedPrivateFileSource {
  listForOwner(ownerId: string, limit: number): Promise<PrivateExportFileReference[]>;
  readForOwner(ownerId: string, reference: PrivateExportFileReference): Promise<Buffer>;
}

export interface PrivateExportArtifactStorage {
  keyForAttempt(ownerId: string, exportId: string, leaseToken: string): string;
  write(ownerId: string, key: string, bytes: Buffer): Promise<void>;
  read(ownerId: string, key: string): Promise<Buffer>;
  remove(ownerId: string, key: string): Promise<void>;
}

export class PrivateExportFileUnavailableError extends Error {
  constructor() { super('private_file_unavailable'); this.name = 'PrivateExportFileUnavailableError'; }
}

export interface AccountDataExportLimits {
  maxAttempts: number;
  leaseMs: number;
  retentionMs: number;
  maxRows: number;
  maxJsonBytes: number;
  maxFiles: number;
  maxSingleFileBytes: number;
  maxTotalFileBytes: number;
  maxArchiveBytes: number;
  readBatchSize: number;
}

export interface AccountDataExportClaim {
  id: string;
  ownerId: string;
  includeFiles: boolean;
  attemptCount: number;
  leaseToken: string;
  leaseExpiresAt: string;
}

export interface AccountDataExportStatus {
  id: string;
  status: 'queued' | 'processing' | 'ready' | 'partial' | 'failed' | 'cancelled' | 'expired';
  includeFiles: boolean;
  attemptCount: number;
  expiresAt: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export class AccountDataExportError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

type ExportRow = {
  id: string;
  owner_id: string;
  include_files: boolean;
  attempt_count: number;
  lease_token: string;
  lease_expires_at: string;
};

type OwnerColumn = 'id' | 'owner_id' | 'user_id';

function ownerColumnFor(table: string): OwnerColumn {
  return ACCOUNT_OWNER_TABLES.find((record) => record.table === table)?.ownerColumn ?? 'owner_id';
}

function safeFileName(value: string): string {
  return value.normalize('NFKC').replace(/[<>:"/\\|?*#^]/g, ' ').replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ').trim().replace(/^[. ]+/g, '').replace(/[. ]+$/g, '').slice(0, 100) || 'file';
}

function safeContentType(value: string): string {
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(value) ? value : 'application/octet-stream';
}

function toStatus(row: Record<string, unknown> | undefined): AccountDataExportStatus | null {
  if (!row) return null;
  return {
    id: String(row.id),
    status: row.status as AccountDataExportStatus['status'],
    includeFiles: Boolean(row.include_files),
    attemptCount: Number(row.attempt_count),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    errorCode: row.error_code ? String(row.error_code) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function ownerIdRequired(ownerId: string): void {
  if (typeof ownerId !== 'string' || ownerId.trim().length === 0) {
    throw new TypeError('An account owner ID is required.');
  }
}

function validateLimits(limits: AccountDataExportLimits): void {
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`Export limit ${key} must be a positive safe integer.`);
  }
}

export function createAccountDataExportService(
  database: DatabaseHandle,
  artifactStorage: PrivateExportArtifactStorage,
  privateFileSource: OwnerScopedPrivateFileSource,
  options: { limits?: Partial<AccountDataExportLimits> } = {},
) {
  const limits: AccountDataExportLimits = { ...ACCOUNT_DATA_EXPORT_LIMITS, ...options.limits };
  validateLimits(limits);
  const dataMapService = createAccountDataMapService(database);

  async function getMapAndRows(ownerId: string) {
    return database.transaction(async () => {
      await database.prepare('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY').run();
      const dataMap = await dataMapService.getForOwner(ownerId);
      const rowCounts = new Map(dataMap.categories.flatMap((category) => category.records.map((record) => [record.table, record.rowCount] as const)));
      const countedRows = [...rowCounts.entries()].filter(([table]) => !ACCOUNT_EXPORT_FIELD_POLICY[table as keyof typeof ACCOUNT_EXPORT_FIELD_POLICY]?.excludedTableReason).reduce((total, [, count]) => total + count, 0);
      const exportRequests = await database.prepare(`SELECT id,status,include_files,attempt_count,error_code,created_at,updated_at,expires_at
        FROM account_data_exports WHERE owner_id=? ORDER BY created_at, id LIMIT ?`).all(ownerId, limits.maxRows + 1) as Array<Record<string, unknown>>;
      const totalRows = countedRows;
      if (totalRows > limits.maxRows) throw new AccountDataExportError('row_limit_exceeded', 'The account data is too large for the configured export row limit.');

      const zip = new JSZip();
      const countsByCategory: Record<string, Record<string, number>> = {};
      let totalJsonBytes = 0;

      for (const category of dataMap.categories) {
        const tables: Record<string, unknown[]> = {};
        const tableCounts: Record<string, number> = {};
        for (const record of category.records) {
          const table = record.table;
          const fieldPolicy = ACCOUNT_EXPORT_FIELD_POLICY[table as keyof typeof ACCOUNT_EXPORT_FIELD_POLICY];
          if (!fieldPolicy) throw new AccountDataExportError('export_field_policy_missing', `The export field policy is missing for ${table}.`);
          if (fieldPolicy.excludedTableReason) continue;
          if (fieldPolicy.included.length === 0) throw new AccountDataExportError('export_field_policy_empty', `The export field policy has no included fields for ${table}.`);
          const projection = fieldPolicy.included.join(',');
          const column = ownerColumnFor(table);
          const expected = rowCounts.get(table) ?? 0;
          const records: Record<string, unknown>[] = [];
          if (table === 'users') {
            const user = await database.prepare(`SELECT ${projection} FROM users WHERE id=?`).get(ownerId) as Record<string, unknown> | undefined;
            if (user) records.push(user);
          } else if (table === 'sessions') {
            const sessions = await database.prepare(`SELECT ${projection} FROM sessions WHERE user_id=? ORDER BY created_at,expires_at`)
              .all(ownerId) as Array<Record<string, unknown>>;
            records.push(...sessions);
          } else {
            for (let offset = 0; offset < expected; offset += limits.readBatchSize) {
              const limit = Math.min(limits.readBatchSize, expected - offset);
              const batch = await database.prepare(`SELECT ${projection} FROM ${table} WHERE ${column}=? ORDER BY ctid LIMIT ? OFFSET ?`)
                .all(ownerId, limit, offset) as Array<Record<string, unknown>>;
              for (const raw of batch) {
                totalJsonBytes += Buffer.byteLength(JSON.stringify(raw));
                if (totalJsonBytes > limits.maxJsonBytes) throw new AccountDataExportError('json_size_limit_exceeded', 'The account data is too large for the configured JSON export limit.');
                records.push(raw);
              }
            }
          }
          if (records.length !== expected) throw new AccountDataExportError('snapshot_mismatch', 'The owner-scoped export snapshot did not match its row counts.');
          tables[table] = records;
          tableCounts[table] = records.length;
        }
        const payload = JSON.stringify({ id: category.id, label: category.label, description: category.description, tables }, null, 2);
        totalJsonBytes += Buffer.byteLength(payload);
        if (totalJsonBytes > limits.maxJsonBytes) throw new AccountDataExportError('json_size_limit_exceeded', 'The account data is too large for the configured JSON export limit.');
        zip.file(`data/${category.id}.json`, payload);
        countsByCategory[category.id] = tableCounts;
      }

      const exportActivity = exportRequests.map((row) => ({
        id: String(row.id),
        status: String(row.status),
        includeFiles: Boolean(row.include_files),
        attemptCount: Number(row.attempt_count),
        errorCode: row.error_code ? String(row.error_code) : null,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        expiresAt: row.expires_at ? String(row.expires_at) : null,
      }));
      const activityPayload = JSON.stringify({ exportRequests: exportActivity }, null, 2);
      totalJsonBytes += Buffer.byteLength(activityPayload);
      if (totalJsonBytes > limits.maxJsonBytes) throw new AccountDataExportError('json_size_limit_exceeded', 'The account data is too large for the configured JSON export limit.');
      zip.file('data/export-activity.json', activityPayload);

      return { dataMap, rowCounts, countsByCategory, zip, totalRows, totalJsonBytes };
    })();
  }

  async function addPrivateFiles(ownerId: string, zip: JSZip) {
    const references = await privateFileSource.listForOwner(ownerId, limits.maxFiles + 1);
    let totalBytes = 0;
    const included: Array<{ path: string; kind: PrivateExportFileKind; name: string; contentType: string; byteSize: number }> = [];
    const omitted: Array<{ kind: PrivateExportFileKind; name: string; reason: 'file_count_limit_exceeded' | 'single_file_limit_exceeded' | 'total_file_limit_exceeded' | 'file_unavailable' }> = [];
    for (const [index, reference] of references.entries()) {
      if (reference.ownerId !== ownerId) throw new AccountDataExportError('foreign_file_reference', 'The private file source returned a record outside the requested owner.');
      if (!['asset', 'import', 'media'].includes(reference.kind) || !reference.key || !Number.isSafeInteger(reference.byteSize) || reference.byteSize < 1) {
        throw new AccountDataExportError('invalid_file_reference', 'A private file reference is invalid.');
      }
      const name = safeFileName(reference.fileName);
      if (index >= limits.maxFiles) { omitted.push({ kind: reference.kind, name, reason: 'file_count_limit_exceeded' }); continue; }
      if (reference.byteSize > limits.maxSingleFileBytes) { omitted.push({ kind: reference.kind, name, reason: 'single_file_limit_exceeded' }); continue; }
      if (totalBytes + reference.byteSize > limits.maxTotalFileBytes) { omitted.push({ kind: reference.kind, name, reason: 'total_file_limit_exceeded' }); continue; }
      let bytes: Buffer;
      try {
        bytes = await privateFileSource.readForOwner(ownerId, reference);
      } catch (cause) {
        if (cause instanceof PrivateExportFileUnavailableError) { omitted.push({ kind: reference.kind, name, reason: 'file_unavailable' }); continue; }
        throw cause;
      }
      if (!Buffer.isBuffer(bytes) || bytes.length !== reference.byteSize || bytes.length > limits.maxSingleFileBytes) {
        throw new AccountDataExportError('private_file_unavailable', 'A requested private file could not be read consistently.');
      }
      totalBytes += bytes.length;
      if (totalBytes > limits.maxTotalFileBytes) throw new AccountDataExportError('file_byte_limit_exceeded', 'The private file bytes exceed the configured export limit.');
      const path = `files/${reference.kind}/${String(index + 1).padStart(4, '0')}-${name}`;
      zip.file(path, bytes);
      included.push({ path, kind: reference.kind, name, contentType: safeContentType(reference.contentType), byteSize: bytes.length });
    }
    return { included, omitted, omittedFileCountAtLeast: omitted.length, totalBytes };
  }

  async function getStatus(ownerId: string, exportId: string): Promise<AccountDataExportStatus | null> {
    ownerIdRequired(ownerId);
    const row = await database.prepare(`SELECT id,status,include_files,attempt_count,expires_at,error_code,created_at,updated_at
      FROM account_data_exports WHERE owner_id=? AND id=?`).get(ownerId, exportId) as Record<string, unknown> | undefined;
    return toStatus(row);
  }

  async function expireIfDue(ownerId: string, exportId: string, now: string): Promise<void> {
    const row = await database.prepare(`UPDATE account_data_exports SET status='expired',updated_at=?
      WHERE owner_id=? AND id=? AND status IN ('ready','partial') AND expires_at<=? RETURNING artifact_key`)
      .get(now, ownerId, exportId, now) as { artifact_key: string | null } | undefined;
    if (row?.artifact_key) {
      try {
        await artifactStorage.remove(ownerId, row.artifact_key);
        await database.prepare('UPDATE account_data_exports SET artifact_key=NULL,updated_at=? WHERE owner_id=? AND id=? AND status=\'expired\'')
          .run(now, ownerId, exportId);
      } catch { /* the bounded worker sweep retries expired artifacts */ }
    }
  }

  return {
    async request(ownerId: string, includeFiles = false, now = new Date()): Promise<AccountDataExportStatus> {
      ownerIdRequired(ownerId);
      if (typeof includeFiles !== 'boolean') throw new TypeError('The includeFiles option must be a boolean.');
      const id = randomUUID();
      const timestamp = now.toISOString();
      const transaction = database.transaction(async () => {
        if (!await lockActiveOwner(database, ownerId)) throw new Error('account_inactive');
        await database.prepare(`INSERT INTO account_data_exports (id,owner_id,status,include_files,attempt_count,created_at,updated_at)
          VALUES (?,?,'queued',?,0,?,?)`).run(id, ownerId, includeFiles, timestamp, timestamp);
        await recordAccountActivityEvent(database, ownerId, 'data_export_requested', timestamp);
      });
      await transaction();
      return (await getStatus(ownerId, id))!;
    },

    getStatus(ownerId: string, exportId: string, now = new Date()) {
      return (async () => {
        ownerIdRequired(ownerId);
        await expireIfDue(ownerId, exportId, now.toISOString());
        return getStatus(ownerId, exportId);
      })();
    },

    async list(ownerId: string, limit = 5, now = new Date()): Promise<AccountDataExportStatus[]> {
      ownerIdRequired(ownerId);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) throw new TypeError('Export history limit must be between 1 and 10.');
      const rows = await database.prepare(`SELECT id FROM account_data_exports WHERE owner_id=? ORDER BY created_at DESC,id DESC LIMIT ?`)
        .all(ownerId, limit) as Array<{ id: string }>;
      const statuses = await Promise.all(rows.map(async (row) => {
        await expireIfDue(ownerId, row.id, now.toISOString());
        return getStatus(ownerId, row.id);
      }));
      return statuses.filter((status): status is AccountDataExportStatus => status !== null);
    },

    async cancel(ownerId: string, exportId: string, now = new Date()): Promise<AccountDataExportStatus | null> {
      ownerIdRequired(ownerId);
      const timestamp = now.toISOString();
      const changed = await database.transaction(async () => {
        const result = await database.prepare(`UPDATE account_data_exports SET status='cancelled',updated_at=?,error_code=NULL
          WHERE owner_id=? AND id=? AND status IN ('queued','failed')`).run(timestamp, ownerId, exportId);
        if (result.changes === 1) await recordAccountActivityEvent(database, ownerId, 'data_export_cancelled', timestamp);
        return result.changes;
      })();
      if (changed === 0) return null;
      return getStatus(ownerId, exportId);
    },

    async retry(ownerId: string, exportId: string, now = new Date()): Promise<AccountDataExportStatus | null> {
      ownerIdRequired(ownerId);
      const timestamp = now.toISOString();
      const changed = await database.transaction(async () => {
        const result = await database.prepare(`UPDATE account_data_exports SET status='queued',updated_at=?,error_code=NULL
          WHERE owner_id=? AND id=? AND status='failed' AND attempt_count<?`).run(timestamp, ownerId, exportId, limits.maxAttempts);
        if (result.changes === 1) await recordAccountActivityEvent(database, ownerId, 'data_export_retried', timestamp);
        return result.changes;
      })();
      if (changed === 0) return null;
      return getStatus(ownerId, exportId);
    },

    async claimNext(now = new Date()): Promise<AccountDataExportClaim | null> {
      const timestamp = now.toISOString();
      await database.transaction(async () => {
        await database.prepare(`UPDATE account_data_exports SET status='failed',lease_token=NULL,lease_expires_at=NULL,
          error_code='lease_exhausted',updated_at=? WHERE status='processing' AND lease_expires_at<=? AND attempt_count>=?`)
          .run(timestamp, timestamp, limits.maxAttempts);
      })();
      return database.transaction(async () => {
        const leaseToken = randomUUID();
        const leaseExpiresAt = new Date(now.getTime() + limits.leaseMs).toISOString();
        const row = await database.prepare(`WITH owner_candidate AS MATERIALIZED (
          SELECT owner.id FROM account_data_exports export JOIN users owner ON owner.id=export.owner_id
          WHERE owner.account_status='active' AND
            (export.status='queued' OR (export.status='processing' AND export.lease_expires_at<=? AND export.attempt_count<?))
          ORDER BY export.created_at,export.id LIMIT 1 FOR UPDATE OF owner SKIP LOCKED
        ), export_candidate AS MATERIALIZED (
          SELECT export.id FROM account_data_exports export JOIN owner_candidate owner ON owner.id=export.owner_id
          WHERE export.status='queued' OR (export.status='processing' AND export.lease_expires_at<=? AND export.attempt_count<?)
          ORDER BY export.created_at,export.id LIMIT 1 FOR UPDATE OF export SKIP LOCKED
        )
        UPDATE account_data_exports AS export SET status='processing',attempt_count=export.attempt_count+1,
          lease_token=?,lease_expires_at=?,updated_at=?,error_code=NULL
        FROM export_candidate candidate WHERE export.id=candidate.id
        RETURNING export.id,export.owner_id,export.include_files,export.attempt_count,export.lease_token,export.lease_expires_at`)
          .get(timestamp, limits.maxAttempts, timestamp, limits.maxAttempts, leaseToken, leaseExpiresAt, timestamp) as ExportRow | undefined;
        return row ? {
          id: row.id, ownerId: row.owner_id, includeFiles: Boolean(row.include_files), attemptCount: Number(row.attempt_count),
          leaseToken: row.lease_token, leaseExpiresAt: row.lease_expires_at,
        } : null;
      })();
    },

    async processClaim(claim: AccountDataExportClaim, now = new Date()): Promise<AccountDataExportStatus | null> {
      const liveClaim = await database.prepare(`SELECT id FROM account_data_exports WHERE id=? AND owner_id=?
        AND status='processing' AND lease_token=? AND lease_expires_at>?`).get(claim.id, claim.ownerId, claim.leaseToken, now.toISOString());
      if (!liveClaim) return getStatus(claim.ownerId, claim.id);

      let artifactKey: string | null = null;
      try {
        const snapshot = await getMapAndRows(claim.ownerId);
        let fileInfo: Awaited<ReturnType<typeof addPrivateFiles>> = { included: [], omitted: [], omittedFileCountAtLeast: 0, totalBytes: 0 };
        if (claim.includeFiles) fileInfo = await addPrivateFiles(claim.ownerId, snapshot.zip);
        const exportedAt = now.toISOString();
        const expiresAt = new Date(now.getTime() + limits.retentionMs).toISOString();
        const manifest = {
          format: 'rembr-personal-data-export',
          version: 1,
          exportId: claim.id,
          exportedAt,
          expiresAt,
          ownerScoped: true,
          rowCount: snapshot.totalRows,
          jsonByteCount: snapshot.totalJsonBytes,
          fileCount: fileInfo.included.length,
          fileByteCount: fileInfo.totalBytes,
          includeFiles: claim.includeFiles,
          completeness: fileInfo.omitted.length > 0 ? 'partial' : 'complete',
          dataMap: snapshot.dataMap,
          exportedTableCounts: snapshot.countsByCategory,
          files: fileInfo.included,
          omittedFiles: fileInfo.omitted,
          omittedFileCountAtLeast: fileInfo.omittedFileCountAtLeast,
          exclusions: [
            'Password hashes are excluded; account identity fields contain only ID, email, status, and creation time.',
            'Session credentials and token hashes are excluded; only session creation and expiry timestamps are included.',
            'Worker lease tokens, lease expiry metadata, and internal private-storage keys are excluded.',
            'Derived local visual vectors are operational similarity indexes and are excluded; the data map reports their row count.',
            'Shared system aggregates, worker status, and global cleanup queue records are not attributable to one owner and are excluded.',
            claim.includeFiles ? 'Private asset, import, and media bytes are listed individually as included or omitted in this manifest. Known files beyond configured limits or no longer available are omitted with a reason code; other storage and integrity errors fail the export.' : 'Private binary file bytes are omitted by request; their database metadata records remain included.',
            'Copies retained by Meta AI, OpenRouter, or upstream model providers are outside Rembr storage and cannot be enumerated or removed by this export.',
          ],
          limits: {
            maxRows: limits.maxRows,
            maxJsonBytes: limits.maxJsonBytes,
            maxFiles: limits.maxFiles,
            maxSingleFileBytes: limits.maxSingleFileBytes,
            maxTotalFileBytes: limits.maxTotalFileBytes,
            maxArchiveBytes: limits.maxArchiveBytes,
          },
          providerBoundary: {
            providers: ['Meta AI API', 'OpenRouter and upstream model providers'],
            note: 'Provider-side request copies and provider retention controls are not accessible through Rembr’s database.',
          },
        };
        snapshot.zip.file('manifest.json', JSON.stringify(manifest, null, 2));
        const archive = await snapshot.zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        if (archive.length > limits.maxArchiveBytes) throw new AccountDataExportError('archive_size_limit_exceeded', 'The compressed archive exceeds the configured export size limit.');
        const completedAt = now.toISOString();
        const finalized = await withOwnerWorkLease(database, claim.ownerId, 'export_write', async (signal) => {
          try {
            const current = await database.prepare(`SELECT artifact_key FROM account_data_exports WHERE owner_id=? AND id=?
              AND status='processing' AND lease_token=? AND lease_expires_at>?`)
              .get(claim.ownerId, claim.id, claim.leaseToken, completedAt) as { artifact_key: string | null } | undefined;
            if (!current) return false;

            // A reclaimed attempt may inherit a durable key from a worker that crashed after writing.
            // Remove it before replacing the pointer; if removal fails, keep the key for deletion/retry.
            if (current.artifact_key) {
              await artifactStorage.remove(claim.ownerId, current.artifact_key);
              await database.prepare(`UPDATE account_data_exports SET artifact_key=NULL,updated_at=?
                WHERE owner_id=? AND id=? AND status='processing' AND lease_token=? AND artifact_key=?`)
                .run(completedAt, claim.ownerId, claim.id, claim.leaseToken, current.artifact_key);
            }

            artifactKey = artifactStorage.keyForAttempt(claim.ownerId, claim.id, claim.leaseToken);
            const staged = await database.prepare(`UPDATE account_data_exports SET artifact_key=?,updated_at=?
              WHERE owner_id=? AND id=? AND status='processing' AND lease_token=? AND lease_expires_at>?`)
              .run(artifactKey, completedAt, claim.ownerId, claim.id, claim.leaseToken, completedAt);
            if (staged.changes !== 1) { artifactKey = null; return false; }

            if (signal.aborted) throw signal.reason ?? new Error('owner_work_lease_lost');
            await artifactStorage.write(claim.ownerId, artifactKey, archive);
            if (signal.aborted) throw signal.reason ?? new Error('owner_work_lease_lost');
            const committed = await database.transaction(async () => {
              if (!await lockActiveOwner(database, claim.ownerId)) {
                await database.prepare(`UPDATE account_data_exports SET status='cancelled',lease_token=NULL,
                  lease_expires_at=NULL,updated_at=?,error_code='account_inactive'
                  WHERE owner_id=? AND id=? AND status='processing' AND lease_token=?`)
                  .run(completedAt, claim.ownerId, claim.id, claim.leaseToken);
                return false;
              }
              const resultStatus = fileInfo.omitted.length > 0 ? 'partial' : 'ready';
              const update = await database.prepare(`UPDATE account_data_exports SET status=?,expires_at=?,
                completed_at=?,updated_at=?,lease_token=NULL,lease_expires_at=NULL,error_code=NULL
                WHERE owner_id=? AND id=? AND status='processing' AND lease_token=? AND lease_expires_at>?`)
                .run(resultStatus, expiresAt, completedAt, completedAt, claim.ownerId, claim.id, claim.leaseToken, completedAt);
              if (update.changes === 1) await recordAccountActivityEvent(database, claim.ownerId, 'data_export_ready', completedAt);
              return update.changes === 1;
            })();
            if (!committed) {
              await artifactStorage.remove(claim.ownerId, artifactKey);
              await database.prepare(`UPDATE account_data_exports SET artifact_key=NULL,updated_at=?
                WHERE owner_id=? AND id=? AND artifact_key=?`).run(completedAt, claim.ownerId, claim.id, artifactKey);
            }
            return committed;
          } catch (cause) {
            if (artifactKey) {
              try {
                await artifactStorage.remove(claim.ownerId, artifactKey);
                await database.prepare(`UPDATE account_data_exports SET artifact_key=NULL,updated_at=?
                  WHERE owner_id=? AND id=? AND artifact_key=?`)
                  .run(completedAt, claim.ownerId, claim.id, artifactKey);
                artifactKey = null;
              } catch { /* retain the durable key for deletion or a later retry */ }
            }
            throw cause;
          }
        });
        if (!finalized) return getStatus(claim.ownerId, claim.id);
      } catch (cause) {
        if (artifactKey) {
          try {
            await artifactStorage.remove(claim.ownerId, artifactKey);
            await database.prepare(`UPDATE account_data_exports SET artifact_key=NULL,updated_at=?
              WHERE owner_id=? AND id=? AND artifact_key=?`)
              .run(now.toISOString(), claim.ownerId, claim.id, artifactKey);
          } catch { /* retain the durable key for deletion or a later retry */ }
        }
        const accountInactive = cause instanceof OwnerLifecycleError && cause.code === 'account_inactive';
        const code = accountInactive ? 'account_inactive' : cause instanceof AccountDataExportError ? cause.code : 'export_failed';
        const updated = await database.prepare(`UPDATE account_data_exports SET status=?,error_code=?,updated_at=?,lease_token=NULL,lease_expires_at=NULL
          WHERE owner_id=? AND id=? AND status='processing' AND lease_token=?`)
          .run(accountInactive ? 'cancelled' : 'failed', code, now.toISOString(), claim.ownerId, claim.id, claim.leaseToken);
        if (updated.changes === 1 && !accountInactive) {
          await recordAccountActivityEvent(database, claim.ownerId, 'data_export_failed', now.toISOString());
        }
      }
      return getStatus(claim.ownerId, claim.id);
    },

    async getDownload(ownerId: string, exportId: string, now = new Date()): Promise<{ bytes: Buffer; contentType: 'application/zip'; fileName: string } | null> {
      ownerIdRequired(ownerId);
      const timestamp = now.toISOString();
      await expireIfDue(ownerId, exportId, timestamp);
      const row = await database.prepare(`SELECT artifact_key FROM account_data_exports WHERE owner_id=? AND id=?
        AND status IN ('ready','partial') AND expires_at>?`).get(ownerId, exportId, timestamp) as { artifact_key: string } | undefined;
      if (!row?.artifact_key) return null;
      let bytes: Buffer;
      try {
        bytes = await artifactStorage.read(ownerId, row.artifact_key);
      } catch {
        const changed = await database.prepare("UPDATE account_data_exports SET status='failed',error_code='artifact_unavailable',artifact_key=NULL,updated_at=? WHERE owner_id=? AND id=? AND status IN ('ready','partial')")
          .run(timestamp, ownerId, exportId);
        if (changed.changes === 1) await recordAccountActivityEvent(database, ownerId, 'data_export_failed', timestamp).catch(() => undefined);
        return null;
      }
      await recordAccountActivityEvent(database, ownerId, 'data_export_downloaded', timestamp).catch(() => undefined);
      return { bytes, contentType: 'application/zip', fileName: 'rembr-personal-data.zip' };
    },

    async cleanupExpiredArtifacts(limit = 100, now = new Date()): Promise<number> {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new TypeError('Cleanup limit must be between 1 and 500.');
      const timestamp = now.toISOString();
      const expired = await database.prepare(`UPDATE account_data_exports SET status='expired',updated_at=?
        WHERE id IN (SELECT id FROM account_data_exports WHERE status IN ('ready','partial') AND expires_at<=? ORDER BY expires_at,id LIMIT ?)
        RETURNING owner_id,id,artifact_key`).all(timestamp, timestamp, limit) as Array<{ owner_id: string; id: string; artifact_key: string | null }>;
      const stale = await database.prepare(`SELECT owner_id,id,artifact_key FROM account_data_exports
        WHERE status='expired' AND artifact_key IS NOT NULL ORDER BY updated_at,id LIMIT ?`).all(limit) as Array<{ owner_id: string; id: string; artifact_key: string }>;
      let removed = 0;
      const cleanupRows = [...new Map([...expired, ...stale].map((row) => [`${row.owner_id}:${row.id}`, row] as const)).values()].slice(0, limit);
      for (const row of cleanupRows) {
        if (!row.artifact_key) continue;
        try {
          await artifactStorage.remove(row.owner_id, row.artifact_key);
          await database.prepare("UPDATE account_data_exports SET artifact_key=NULL,updated_at=? WHERE owner_id=? AND id=? AND status='expired'")
            .run(timestamp, row.owner_id, row.id);
          removed += 1;
        } catch { /* retain the key for a later bounded retry */ }
      }
      return removed;
    },
  };
}
