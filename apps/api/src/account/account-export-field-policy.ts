export interface AccountExportTableFieldPolicy {
  included: readonly string[];
  excluded: Readonly<Record<string, string>>;
  excludedTableReason?: string;
}

// Every field in the owner-scoped data map is classified here. New schema columns
// remain outside exports until they are explicitly reviewed and added to this policy.
export const ACCOUNT_EXPORT_FIELD_POLICY: Readonly<Record<string, AccountExportTableFieldPolicy>> = {
  "users": {
    "included": [
      "id",
      "email",
      "created_at",
      "account_status"
    ],
    "excluded": {
      "password_hash": "Password verifier is a credential and is never exported."
    }
  },
  "sessions": {
    "included": [
      "expires_at",
      "created_at"
    ],
    "excluded": {
      "id": "Session identifiers are operational tokens and are not required in the export.",
      "user_id": "Owner linkage is represented by the parent account and is not repeated.",
      "token_hash": "Authentication token hashes are credentials and are never exported."
    }
  },
  "profiles": {
    "included": [
      "user_id",
      "username",
      "avatar_url",
      "avatar_asset_id",
      "created_at",
      "updated_at"
    ],
    "excluded": {}
  },
  "onboarding_preferences": {
    "included": [
      "user_id",
      "referral_source",
      "completed_at",
      "skipped_at",
      "created_at",
      "updated_at"
    ],
    "excluded": {}
  },
  "onboarding_content_types": {
    "included": [
      "user_id",
      "content_type"
    ],
    "excluded": {}
  },
  "admin_roles": {
    "included": [
      "role",
      "created_at"
    ],
    "excluded": {
      "user_id": "Operator account identity is represented by the account record.",
      "granted_by": "The granting operator’s identity is excluded from personal exports."
    }
  },
  "saved_items": {
    "included": [
      "id",
      "owner_id",
      "original_url",
      "canonical_url",
      "title",
      "description",
      "status",
      "error_code",
      "created_at",
      "updated_at",
      "item_kind",
      "title_override",
      "description_override",
      "source_platform",
      "source_id",
      "source_metadata_json"
    ],
    "excluded": {}
  },
  "notes": {
    "included": [
      "owner_id",
      "item_id",
      "body",
      "created_at",
      "updated_at"
    ],
    "excluded": {}
  },
  "note_links": {
    "included": [
      "id",
      "owner_id",
      "item_id",
      "url",
      "position",
      "created_at"
    ],
    "excluded": {}
  },
  "tags": {
    "included": [
      "id",
      "owner_id",
      "normalized_name",
      "display_name",
      "created_at",
      "updated_at"
    ],
    "excluded": {}
  },
  "item_tags": {
    "included": [
      "owner_id",
      "item_id",
      "tag_id",
      "created_at"
    ],
    "excluded": {}
  },
  "collections": {
    "included": [
      "id",
      "owner_id",
      "name",
      "normalized_name",
      "description",
      "created_at",
      "updated_at"
    ],
    "excluded": {}
  },
  "collection_items": {
    "included": [
      "owner_id",
      "collection_id",
      "item_id",
      "created_at"
    ],
    "excluded": {}
  },
  "smart_collections": {
    "included": [
      "id",
      "owner_id",
      "slug",
      "name",
      "description",
      "source_type",
      "pinned",
      "hidden",
      "generation_metadata",
      "created_at",
      "updated_at"
    ],
    "excluded": {}
  },
  "smart_collection_item_overrides": {
    "included": [
      "owner_id",
      "collection_id",
      "item_id",
      "action",
      "reason",
      "created_at",
      "updated_at"
    ],
    "excluded": {}
  },
  "library_reminders": {
    "included": [
      "id",
      "owner_id",
      "item_id",
      "remind_at",
      "status",
      "reason",
      "note",
      "completed_at",
      "created_at",
      "updated_at"
    ],
    "excluded": {}
  },
  "imports": {
    "included": [
      "id",
      "owner_id",
      "request_id",
      "source",
      "status",
      "total_bytes",
      "file_count",
      "parsed_count",
      "new_count",
      "duplicate_count",
      "skipped_count",
      "failed_count",
      "cleanup_status",
      "cleanup_attempts",
      "error_code",
      "created_at",
      "updated_at",
      "completed_at",
      "idempotency_key"
    ],
    "excluded": {
      "lease_token": "Worker lease credentials are operational metadata.",
      "lease_expires_at": "Worker lease timing is operational metadata."
    }
  },
  "import_entries": {
    "included": [
      "id",
      "owner_id",
      "import_id",
      "upload_file_id",
      "item_id",
      "job_id",
      "source_platform",
      "source_url",
      "source_id",
      "title",
      "source_metadata_json",
      "status",
      "error_code",
      "created_at",
      "source_order"
    ],
    "excluded": {}
  },
  "processing_jobs": {
    "included": [
      "id",
      "owner_id",
      "item_id",
      "import_id",
      "correlation_id",
      "generation",
      "status",
      "attempts",
      "max_attempts",
      "available_at",
      "error_code",
      "created_at",
      "updated_at",
      "source_order"
    ],
    "excluded": {
      "lease_token": "Worker lease credentials are operational metadata.",
      "lease_expires_at": "Worker lease timing is operational metadata.",
      "heartbeat_at": "Worker liveness metadata is operational."
    }
  },
  "job_attempts": {
    "included": [
      "id",
      "owner_id",
      "job_id",
      "generation",
      "attempt_number",
      "status",
      "error_code",
      "correlation_id",
      "started_at",
      "finished_at"
    ],
    "excluded": {}
  },
  "job_pause_states": {
    "included": [
      "owner_id",
      "job_id",
      "pause_cause",
      "paused_at"
    ],
    "excluded": {}
  },
  "ai_analysis_jobs": {
    "included": [
      "id",
      "owner_id",
      "import_id",
      "item_id",
      "generation",
      "status",
      "pause_reason",
      "attempts",
      "max_attempts",
      "available_at",
      "error_code",
      "created_at",
      "updated_at",
      "completed_at"
    ],
    "excluded": {
      "lease_token": "Worker lease credentials are operational metadata.",
      "lease_expires_at": "Worker lease timing is operational metadata."
    }
  },
  "visual_embedding_jobs": {
    "included": [
      "id",
      "owner_id",
      "item_id",
      "status",
      "attempts",
      "available_at",
      "error_code",
      "created_at",
      "updated_at",
      "completed_at"
    ],
    "excluded": {
      "lease_token": "Worker lease credentials are operational metadata.",
      "lease_expires_at": "Worker lease timing is operational metadata."
    }
  },
  "extracted_artifacts": {
    "included": [
      "id",
      "owner_id",
      "item_id",
      "title",
      "description",
      "text_content",
      "fetched_at",
      "created_at"
    ],
    "excluded": {}
  },
  "ai_analysis_results": {
    "included": [
      "id",
      "owner_id",
      "item_id",
      "generation",
      "status",
      "model",
      "summary",
      "visual_description",
      "ocr_text",
      "transcript",
      "keywords_json",
      "tags_json",
      "image_count",
      "image_bytes",
      "video_count",
      "max_video_bytes",
      "audio_seconds",
      "input_tokens",
      "output_tokens",
      "billed_microusd",
      "created_at",
      "brands_json",
      "tools_json",
      "people_json",
      "repositories_json"
    ],
    "excluded": {}
  },
  "ai_saved_item_summaries": {
    "included": [
      "id",
      "owner_id",
      "item_id",
      "generation",
      "model",
      "prompt_version",
      "source_sha256",
      "source_characters",
      "summary",
      "input_tokens",
      "output_tokens",
      "billed_microusd",
      "created_at"
    ],
    "excluded": {}
  },
  "semantic_item_embeddings": {
    "included": [
      "owner_id",
      "item_id",
      "model",
      "content_hash",
      "embedding",
      "created_at",
      "updated_at"
    ],
    "excluded": {}
  },
  "visual_item_embeddings": {
    "included": [],
    "excluded": {},
    "excludedTableReason": "Local visual vectors are operational similarity indexes; the data map reports their row count."
  },
  "link_health_checks": {
    "included": [
      "id",
      "owner_id",
      "item_id",
      "status",
      "source_url",
      "final_url",
      "http_status",
      "error_code",
      "error_message",
      "checked_at",
      "created_at",
      "updated_at"
    ],
    "excluded": {}
  },
  "search_events": {
    "included": [
      "id",
      "owner_id",
      "query_hash",
      "query_length",
      "filters_json",
      "result_count",
      "created_at"
    ],
    "excluded": {}
  },
  "search_event_results": {
    "included": [
      "owner_id",
      "event_id",
      "item_id",
      "result_rank",
      "created_at"
    ],
    "excluded": {}
  },
  "search_result_feedback": {
    "included": [
      "owner_id",
      "event_id",
      "item_id",
      "rating",
      "created_at",
      "updated_at"
    ],
    "excluded": {}
  },
  "ai_analysis_preferences": {
    "included": [
      "owner_id",
      "enabled",
      "consent_version",
      "consented_at",
      "disabled_at",
      "updated_at",
      "local_ocr_enabled",
      "local_ocr_consent_version",
      "local_ocr_consented_at",
      "local_ocr_disabled_at",
      "local_asr_enabled",
      "local_asr_consent_version",
      "local_asr_consented_at",
      "local_asr_disabled_at",
      "local_visual_enabled",
      "local_visual_consent_version",
      "local_visual_consented_at",
      "local_visual_disabled_at"
    ],
    "excluded": {}
  },
  "ai_search_preferences": {
    "included": [
      "owner_id",
      "enabled",
      "consent_version",
      "consented_at",
      "disabled_at",
      "updated_at"
    ],
    "excluded": {}
  },
  "semantic_search_preferences": {
    "included": [
      "owner_id",
      "enabled",
      "disclosure_version",
      "consented_at",
      "disabled_at",
      "updated_at"
    ],
    "excluded": {}
  },
  "ai_visual_search_preferences": {
    "included": [
      "owner_id",
      "enabled",
      "consent_version",
      "consented_at",
      "disabled_at",
      "updated_at"
    ],
    "excluded": {}
  },
  "ai_import_usage": {
    "included": [
      "owner_id",
      "import_id",
      "cap_microusd",
      "spent_microusd",
      "reserved_microusd",
      "created_at",
      "updated_at"
    ],
    "excluded": {}
  },
  "ai_usage_reservations": {
    "included": [
      "id",
      "owner_id",
      "import_id",
      "job_id",
      "attempt_number",
      "month_start",
      "reserved_microusd",
      "actual_microusd",
      "status",
      "created_at",
      "settled_at"
    ],
    "excluded": {}
  },
  "ai_search_usage_reservations": {
    "included": [
      "id",
      "owner_id",
      "month_start",
      "reserved_microusd",
      "actual_microusd",
      "status",
      "created_at",
      "settled_at"
    ],
    "excluded": {}
  },
  "account_data_exports": {
    "included": [
      "id",
      "owner_id",
      "status",
      "include_files",
      "attempt_count",
      "expires_at",
      "error_code",
      "created_at",
      "updated_at",
      "completed_at"
    ],
    "excluded": {
      "lease_token": "Worker lease credentials are operational metadata.",
      "lease_expires_at": "Worker lease timing is operational metadata.",
      "artifact_key": "Private export object locators are excluded."
    }
  },
  "account_deletion_requests": {
    "included": [
      "id",
      "owner_id",
      "status",
      "export_confirmed",
      "attempt_count",
      "operator_retry_count",
      "max_attempts",
      "requested_at",
      "available_at",
      "approved_at",
      "completed_at",
      "cancelled_at",
      "error_code",
      "created_at",
      "updated_at"
    ],
    "excluded": {
      "owner_hash": "Pseudonymous deletion lookup material is operational and excluded.",
      "approved_by": "The approving operator’s identity is excluded from personal exports.",
      "lease_token": "Worker lease credentials are operational metadata.",
      "lease_expires_at": "Worker lease timing is operational metadata."
    }
  },
  "account_security_events": {
    "included": [
      "id",
      "owner_id",
      "event_type",
      "created_at"
    ],
    "excluded": {}
  },
  "account_activity_events": {
    "included": [
      "id",
      "owner_id",
      "event_type",
      "created_at"
    ],
    "excluded": {}
  },
  "asset_objects": {
    "included": [
      "id",
      "owner_id",
      "kind",
      "detected_mime",
      "byte_size",
      "sha256",
      "state",
      "created_at",
      "updated_at"
    ],
    "excluded": {
      "storage_key": "Private object locators are excluded; referenced bytes are handled separately."
    }
  },
  "note_assets": {
    "included": [
      "owner_id",
      "item_id",
      "asset_id",
      "position"
    ],
    "excluded": {}
  },
  "import_upload_files": {
    "included": [
      "id",
      "owner_id",
      "import_id",
      "original_name",
      "extension",
      "declared_mime",
      "expected_bytes",
      "received_bytes",
      "chunk_count",
      "chunks_received",
      "state",
      "created_at",
      "updated_at"
    ],
    "excluded": {
      "storage_key": "Private object locators are excluded; referenced bytes are handled separately."
    }
  },
  "import_upload_chunks": {
    "included": [
      "id",
      "owner_id",
      "upload_file_id",
      "chunk_index",
      "byte_size",
      "sha256",
      "created_at"
    ],
    "excluded": {
      "storage_key": "Private object locators are excluded; referenced bytes are handled separately."
    }
  },
  "media_artifacts": {
    "included": [
      "id",
      "owner_id",
      "item_id",
      "generation",
      "source_url",
      "detected_mime",
      "byte_size",
      "sha256",
      "status",
      "error_code",
      "active",
      "created_at"
    ],
    "excluded": {
      "storage_key": "Private object locators are excluded; referenced bytes are handled separately."
    }
  }
};
