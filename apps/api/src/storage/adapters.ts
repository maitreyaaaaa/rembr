import { LocalAssetStorage } from '../assets/storage.js';
import { LocalImportStorage } from '../imports/storage.js';
import { LocalMediaStorage } from '../media/storage.js';
import { config } from '../config.js';
import { createSupabaseStorage } from './supabase-adapters.js';
import { LocalPrivateExportArtifactStorage } from './account-export-storage.js';

export function createStorageAdapters() {
  if (config.STORAGE_BACKEND === 'supabase') {
    return createSupabaseStorage({
      supabaseUrl: config.supabaseUrl!,
      serviceRoleKey: config.supabaseServiceRoleKey!,
      assetBucket: config.SUPABASE_ASSET_BUCKET,
      importBucket: config.SUPABASE_IMPORT_BUCKET,
      mediaBucket: config.SUPABASE_MEDIA_BUCKET,
      exportBucket: config.SUPABASE_EXPORT_BUCKET,
    });
  }
  return {
    assets: new LocalAssetStorage(config.assetDirectory),
    imports: new LocalImportStorage(config.importDirectory),
    media: new LocalMediaStorage(config.mediaDirectory),
    exports: new LocalPrivateExportArtifactStorage(config.dataExportDirectory),
  };
}
