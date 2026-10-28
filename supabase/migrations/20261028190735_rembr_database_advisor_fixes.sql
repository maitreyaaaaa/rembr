CREATE INDEX IF NOT EXISTS import_entries_owner_item_idx ON public.import_entries(owner_id, item_id);
CREATE INDEX IF NOT EXISTS import_entries_owner_job_idx ON public.import_entries(owner_id, job_id);
CREATE INDEX IF NOT EXISTS import_entries_owner_upload_file_idx ON public.import_entries(owner_id, upload_file_id);
CREATE INDEX IF NOT EXISTS import_upload_files_owner_import_idx ON public.import_upload_files(owner_id, import_id);
CREATE INDEX IF NOT EXISTS note_assets_owner_asset_idx ON public.note_assets(owner_id, asset_id);
CREATE INDEX IF NOT EXISTS processing_jobs_owner_item_idx ON public.processing_jobs(owner_id, item_id);
CREATE INDEX IF NOT EXISTS profiles_user_avatar_asset_idx ON public.profiles(user_id, avatar_asset_id);

ALTER FUNCTION public.rembr_guard_import_chunk_index() SET search_path = public, pg_temp;
ALTER FUNCTION public.rembr_guard_import_entry_job_item() SET search_path = public, pg_temp;
ALTER FUNCTION public.rembr_guard_import_cleanup_before_delete() SET search_path = public, pg_temp;
