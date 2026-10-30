import type { DatabaseHandle } from '../db/database.js';

type OwnerColumn = 'id' | 'owner_id' | 'user_id';
type CountedTable = { table: string; ownerColumn: OwnerColumn };
type DataMapCategoryDefinition = {
  id: string;
  label: string;
  description: string;
  records: readonly CountedTable[];
};

const categories: readonly DataMapCategoryDefinition[] = [
  {
    id: 'account',
    label: 'Account and preferences',
    description: 'Account identity, sessions, profile, and onboarding choices.',
    records: [
      { table: 'users', ownerColumn: 'id' },
      { table: 'sessions', ownerColumn: 'user_id' },
      { table: 'profiles', ownerColumn: 'user_id' },
      { table: 'onboarding_preferences', ownerColumn: 'user_id' },
      { table: 'onboarding_content_types', ownerColumn: 'user_id' },
    ],
  },
  {
    id: 'saved_library',
    label: 'Saved library and organization',
    description: 'Saved items, notes, tags, collections, reminders, and their relationships.',
    records: [
      { table: 'saved_items', ownerColumn: 'owner_id' },
      { table: 'notes', ownerColumn: 'owner_id' },
      { table: 'note_links', ownerColumn: 'owner_id' },
      { table: 'tags', ownerColumn: 'owner_id' },
      { table: 'item_tags', ownerColumn: 'owner_id' },
      { table: 'collections', ownerColumn: 'owner_id' },
      { table: 'collection_items', ownerColumn: 'owner_id' },
      { table: 'smart_collections', ownerColumn: 'owner_id' },
      { table: 'smart_collection_item_overrides', ownerColumn: 'owner_id' },
      { table: 'library_reminders', ownerColumn: 'owner_id' },
    ],
  },
  {
    id: 'imports_and_processing',
    label: 'Imports and processing history',
    description: 'Import records, processing jobs, attempts, pauses, and analysis workflow records.',
    records: [
      { table: 'imports', ownerColumn: 'owner_id' },
      { table: 'import_entries', ownerColumn: 'owner_id' },
      { table: 'processing_jobs', ownerColumn: 'owner_id' },
      { table: 'job_attempts', ownerColumn: 'owner_id' },
      { table: 'job_pause_states', ownerColumn: 'owner_id' },
      { table: 'ai_analysis_jobs', ownerColumn: 'owner_id' },
    ],
  },
  {
    id: 'derived_content',
    label: 'Extracted and derived content',
    description: 'Content extracted or generated from saved items, including media metadata, summaries, and embeddings.',
    records: [
      { table: 'extracted_artifacts', ownerColumn: 'owner_id' },
      { table: 'ai_analysis_results', ownerColumn: 'owner_id' },
      { table: 'ai_saved_item_summaries', ownerColumn: 'owner_id' },
      { table: 'semantic_item_embeddings', ownerColumn: 'owner_id' },
      { table: 'link_health_checks', ownerColumn: 'owner_id' },
    ],
  },
  {
    id: 'search_activity',
    label: 'Search activity and feedback',
    description: 'Stored search-event metadata, result references, and feedback. Raw search text is not stored.',
    records: [
      { table: 'search_events', ownerColumn: 'owner_id' },
      { table: 'search_event_results', ownerColumn: 'owner_id' },
      { table: 'search_result_feedback', ownerColumn: 'owner_id' },
    ],
  },
  {
    id: 'ai_preferences_and_usage',
    label: 'AI preferences, consent, and usage records',
    description: 'AI provider consent/preferences and owner-scoped usage or budget records.',
    records: [
      { table: 'ai_analysis_preferences', ownerColumn: 'owner_id' },
      { table: 'ai_search_preferences', ownerColumn: 'owner_id' },
      { table: 'semantic_search_preferences', ownerColumn: 'owner_id' },
      { table: 'ai_visual_search_preferences', ownerColumn: 'owner_id' },
      { table: 'ai_import_usage', ownerColumn: 'owner_id' },
      { table: 'ai_usage_reservations', ownerColumn: 'owner_id' },
      { table: 'ai_search_usage_reservations', ownerColumn: 'owner_id' },
    ],
  },
  {
    id: 'privacy_requests',
    label: 'Privacy and data export activity',
    description: 'Personal data export and account deletion request status and timestamps. Download artifacts and worker lease details are excluded.',
    records: [
      { table: 'account_data_exports', ownerColumn: 'owner_id' },
      { table: 'account_deletion_requests', ownerColumn: 'owner_id' },
    ],
  },
  {
    id: 'security_activity',
    label: 'Account security activity',
    description: 'Recent sign-in, sign-out, and deletion request events. Only event labels and timestamps are stored.',
    records: [{ table: 'account_security_events', ownerColumn: 'owner_id' }],
  },
  {
    id: 'private_file_references',
    label: 'Private file references and upload metadata',
    description: 'Database records that reference private assets or staged upload bytes.',
    records: [
      { table: 'asset_objects', ownerColumn: 'owner_id' },
      { table: 'note_assets', ownerColumn: 'owner_id' },
      { table: 'import_upload_files', ownerColumn: 'owner_id' },
      { table: 'import_upload_chunks', ownerColumn: 'owner_id' },
      { table: 'media_artifacts', ownerColumn: 'owner_id' },
    ],
  },
];

export const ACCOUNT_OWNER_TABLES: readonly CountedTable[] = categories.flatMap((category) => category.records);
const countedTables = ACCOUNT_OWNER_TABLES;
const countSql = countedTables.map(({ table, ownerColumn }) =>
  `SELECT '${table}' AS table_name, COUNT(*) AS row_count FROM ${table} WHERE ${ownerColumn} = ?`,
).join('\nUNION ALL\n');

export interface AccountDataMapRecordCount {
  table: string;
  rowCount: number;
}

export interface AccountDataMapCategory {
  id: string;
  label: string;
  description: string;
  rowCount: number;
  records: AccountDataMapRecordCount[];
}

export interface AccountDataMap {
  generatedAt: string;
  categories: AccountDataMapCategory[];
  privateFileBytes: {
    storage: 'server_private_storage';
    rowCount: null;
    counted: false;
    note: string;
  };
  externalProviderCopies: {
    rowCount: null;
    counted: false;
    note: string;
    providers: string[];
  };
  excludedSharedRecords: Array<{ table: string; reason: string }>;
  excludedOperationalRecords: Array<{ table: string; reason: string }>;
}

export function createAccountDataMapService(database: DatabaseHandle) {
  return {
    async getForOwner(ownerId: string): Promise<AccountDataMap> {
      if (typeof ownerId !== 'string' || ownerId.trim().length === 0) {
        throw new TypeError('An account owner ID is required to build the data map.');
      }

      const rows = await database.prepare(countSql).all(ownerId, ...Array(countedTables.length - 1).fill(ownerId)) as Array<{ table_name: string; row_count: number | string }>;
      const rowCounts = new Map(rows.map((row) => [row.table_name, Number(row.row_count)]));
      const mappedCategories = categories.map((category) => {
        const records = category.records.map(({ table }) => ({ table, rowCount: rowCounts.get(table) ?? 0 }));
        return {
          id: category.id,
          label: category.label,
          description: category.description,
          rowCount: records.reduce((sum, record) => sum + record.rowCount, 0),
          records,
        };
      });

      return {
        generatedAt: new Date().toISOString(),
        categories: mappedCategories,
        privateFileBytes: {
          storage: 'server_private_storage',
          rowCount: null,
          counted: false,
          note: 'Private binary bytes are stored outside Postgres by the configured server storage adapter (local private files or private Supabase buckets). The counts above include file-reference and upload-metadata rows, not byte totals or a guarantee that each referenced object is currently present.',
        },
        externalProviderCopies: {
          rowCount: null,
          counted: false,
          note: 'Provider-side request copies are outside Rembr’s database and cannot be enumerated or deleted by this data map. Their handling follows the provider and upstream model terms.',
          providers: ['Meta AI API', 'OpenRouter and its upstream model providers'],
        },
        excludedSharedRecords: [
          { table: 'ai_monthly_usage', reason: 'Contains shared monthly aggregates and has no owner_id, so it cannot be safely attributed to one account.' },
          { table: 'ai_worker_status', reason: 'Contains global worker readiness, not user-owned data.' },
        ],
        excludedOperationalRecords: [
          { table: 'media_cleanup_queue', reason: 'Contains private storage keys and internal retry state; owner-tagged entries are drained during account deletion, while legacy unattributed entries remain in the worker-wide cleanup sweep.' },
        ],
      };
    },
  };
}
