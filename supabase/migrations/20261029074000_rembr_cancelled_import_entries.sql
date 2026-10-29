ALTER TABLE import_entries DROP CONSTRAINT import_entries_status_check;
ALTER TABLE import_entries ADD CONSTRAINT import_entries_status_check
  CHECK (status IN ('queued', 'processing', 'saved', 'duplicate', 'skipped', 'failed', 'cancelled'));

-- Reconcile entry labels from jobs settled before entry state was synchronized.
UPDATE import_entries AS entry
SET status = CASE
      WHEN job.status IN ('completed', 'partial') THEN 'saved'
      WHEN job.status = 'failed' THEN 'failed'
      WHEN job.status = 'cancelled' THEN 'cancelled'
      ELSE 'processing'
    END,
    error_code = CASE
      WHEN job.status = 'cancelled' THEN 'cancelled'
      WHEN job.status = 'partial' THEN job.error_code
      WHEN job.status = 'failed' THEN job.error_code
      ELSE NULL
    END
FROM processing_jobs AS job
WHERE entry.owner_id = job.owner_id
  AND entry.import_id = job.import_id
  AND entry.job_id = job.id
  AND entry.status = 'queued'
  AND job.status IN ('processing', 'cancel_requested', 'completed', 'partial', 'failed', 'cancelled');
