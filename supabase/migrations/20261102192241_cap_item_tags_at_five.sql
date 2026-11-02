-- Replace noisy imported hashtag chips with at most five curated labels per save.
-- Existing account-created tags are preserved when they are not source hashtags.
CREATE TEMP TABLE rembr_curated_tag_assignments AS
WITH source_hashtags AS (
  SELECT saved_items.owner_id, saved_items.id AS item_id, lower(btrim(hashtag.value)) AS normalized_name,
    btrim(hashtag.value) AS display_name, hashtag.ordinality AS position
  FROM saved_items
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(saved_items.source_metadata_json::jsonb->'hashtags') = 'array'
      THEN saved_items.source_metadata_json::jsonb->'hashtags' ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS hashtag(value, ordinality)
  WHERE length(btrim(hashtag.value)) BETWEEN 2 AND 40
    AND btrim(hashtag.value) ~ '[[:alpha:]]{2}'
    AND btrim(hashtag.value) !~ '[0-9]'
    AND lower(btrim(hashtag.value)) !~ '^[0-9a-f]{6}([0-9a-f]{2})?$'
    AND lower(btrim(hashtag.value)) NOT IN ('explore','explorepage','fyp','followme','followforfollow','f4f',
      'likeforlike','likeforlikes','l4l','instagood','instagram','reels','photooftheday','picoftheday','viral','trending')
), manual_tags AS (
  SELECT item_tags.owner_id, item_tags.item_id, tags.normalized_name, tags.display_name,
    0 AS priority, item_tags.created_at, row_number() OVER (
      PARTITION BY item_tags.owner_id, item_tags.item_id ORDER BY item_tags.created_at DESC, tags.normalized_name
    ) AS position
  FROM item_tags
  JOIN tags ON tags.owner_id = item_tags.owner_id AND tags.id = item_tags.tag_id
  JOIN saved_items ON saved_items.owner_id = item_tags.owner_id AND saved_items.id = item_tags.item_id
  WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(saved_items.source_metadata_json::jsonb->'hashtags') = 'array'
        THEN saved_items.source_metadata_json::jsonb->'hashtags' ELSE '[]'::jsonb END
    ) AS source(value)
    WHERE lower(btrim(source.value)) = tags.normalized_name
  )
), latest_analysis AS (
  SELECT DISTINCT ON (owner_id, item_id) owner_id, item_id, tags_json
  FROM ai_analysis_results
  ORDER BY owner_id, item_id, generation DESC
), analysis_tags AS (
  SELECT latest_analysis.owner_id, latest_analysis.item_id, btrim(topic.value) AS display_name,
    lower(btrim(topic.value)) AS normalized_name, 1 AS priority, now()::text AS created_at, topic.ordinality AS position
  FROM latest_analysis
  CROSS JOIN LATERAL jsonb_array_elements_text(latest_analysis.tags_json::jsonb) WITH ORDINALITY AS topic(value, ordinality)
  WHERE length(btrim(topic.value)) BETWEEN 2 AND 40 AND btrim(topic.value) ~ '[[:alpha:]]{2}'
), hashtag_tags AS (
  SELECT owner_id, item_id, normalized_name, display_name, 2 AS priority, now()::text AS created_at, position
  FROM source_hashtags
), candidates AS (
  SELECT * FROM manual_tags
  UNION ALL SELECT * FROM analysis_tags
  UNION ALL SELECT * FROM hashtag_tags
), deduplicated AS (
  SELECT DISTINCT ON (owner_id, item_id, normalized_name) owner_id, item_id, normalized_name, display_name,
    priority, created_at, position
  FROM candidates
  ORDER BY owner_id, item_id, normalized_name, priority, position
), ranked AS (
  SELECT *, row_number() OVER (
    PARTITION BY owner_id, item_id ORDER BY priority, position, normalized_name
  ) AS item_position
  FROM deduplicated
)
SELECT owner_id, item_id, normalized_name, display_name, created_at
FROM ranked WHERE item_position <= 5;

INSERT INTO tags (id, owner_id, normalized_name, display_name, created_at, updated_at)
SELECT gen_random_uuid()::text, owner_id, normalized_name, display_name, now()::text, now()::text
FROM (SELECT DISTINCT ON (owner_id, normalized_name) owner_id, normalized_name, display_name
  FROM rembr_curated_tag_assignments ORDER BY owner_id, normalized_name, display_name) AS curated
ON CONFLICT (owner_id, normalized_name) DO NOTHING;

DELETE FROM item_tags;

INSERT INTO item_tags (owner_id, item_id, tag_id, created_at)
SELECT curated.owner_id, curated.item_id, tags.id, curated.created_at
FROM rembr_curated_tag_assignments AS curated
JOIN tags ON tags.owner_id = curated.owner_id AND tags.normalized_name = curated.normalized_name
ON CONFLICT (owner_id, item_id, tag_id) DO NOTHING;

DELETE FROM tags
WHERE NOT EXISTS (SELECT 1 FROM item_tags WHERE item_tags.owner_id = tags.owner_id AND item_tags.tag_id = tags.id)
  AND EXISTS (
    SELECT 1 FROM saved_items
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(saved_items.source_metadata_json::jsonb->'hashtags') = 'array'
        THEN saved_items.source_metadata_json::jsonb->'hashtags' ELSE '[]'::jsonb END
    ) AS source(value)
    WHERE saved_items.owner_id = tags.owner_id AND lower(btrim(source.value)) = tags.normalized_name
  );

DROP TABLE rembr_curated_tag_assignments;
