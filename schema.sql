-- Social Sentinel Hub — D1 Schema
-- Content queue for scheduling + publish history for audit trail

CREATE TABLE IF NOT EXISTS content_queue (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  platform TEXT NOT NULL,              -- 'bluesky', 'twitter', 'facebook'
  content TEXT NOT NULL,               -- Post text
  media_url TEXT,                      -- Optional image/media URL
  media_alt TEXT,                      -- Alt text for accessibility
  link_url TEXT,                       -- Optional link attachment
  scheduled_at TEXT,                   -- When to publish (NULL = draft)
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  published_at TEXT,
  post_url TEXT,                       -- URL of published post
  post_id TEXT,                        -- Platform-specific post ID
  error TEXT,                          -- Error message if failed
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cq_status_scheduled ON content_queue(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_cq_tenant ON content_queue(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_cq_platform ON content_queue(platform, status);

-- Publish history — immutable audit trail
CREATE TABLE IF NOT EXISTS publish_history (
  id TEXT PRIMARY KEY,
  queue_id TEXT,                        -- Reference to content_queue (NULL for direct publishes)
  tenant_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  content TEXT NOT NULL,
  post_url TEXT,
  post_id TEXT,
  action TEXT NOT NULL DEFAULT 'publish', -- 'publish', 'delete', 'like', 'repost', 'reply', 'follow'
  status TEXT NOT NULL,                -- 'success', 'failed'
  error TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ph_tenant ON publish_history(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ph_platform ON publish_history(platform, created_at);

-- Engagement tracking — track interactions for analytics
CREATE TABLE IF NOT EXISTS engagement_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  action TEXT NOT NULL,                -- 'like', 'repost', 'reply', 'follow'
  target_id TEXT NOT NULL,             -- Platform-specific target post/user ID
  result_id TEXT,                      -- Platform-specific result ID
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_el_tenant ON engagement_log(tenant_id, created_at);
