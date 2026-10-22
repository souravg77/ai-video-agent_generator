-- Core tables for the video agent. Phase 1+ fills these in.

CREATE TABLE IF NOT EXISTS videos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic         text NOT NULL,
  status        text NOT NULL DEFAULT 'idea'
                CHECK (status IN ('idea', 'scripted', 'rendering', 'rendered', 'approved', 'rejected', 'failed')),
  script        jsonb,              -- hook, scenes, narration, on-screen text
  title         text,
  description   text,
  hashtags      text[] NOT NULL DEFAULT '{}',
  storage_key   text,               -- object key of the final MP4 in R2
  duration_sec  numeric(6,2),
  cost_usd      numeric(10,4) NOT NULL DEFAULT 0,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS posts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id       uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  platform       text NOT NULL CHECK (platform IN ('youtube', 'facebook', 'instagram')),
  status         text NOT NULL DEFAULT 'scheduled'
                 CHECK (status IN ('scheduled', 'uploading', 'processing', 'published', 'failed')),
  scheduled_for  timestamptz,
  external_id    text,              -- YouTube video id, FB video id, IG media id
  url            text,
  attempts       int NOT NULL DEFAULT 0,
  error          text,
  published_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id, platform)
);

CREATE TABLE IF NOT EXISTS post_stats (
  post_id      uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  captured_at  timestamptz NOT NULL DEFAULT now(),
  views        bigint,
  likes        bigint,
  comments     bigint,
  shares       bigint,
  watch_time_sec bigint,
  PRIMARY KEY (post_id, captured_at)
);

CREATE INDEX IF NOT EXISTS posts_due_idx ON posts (scheduled_for) WHERE status = 'scheduled';

-- Phase 4: the agent's calendar and review queue live on the videos table.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS angle text;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS publish_at timestamptz;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS platforms text[] NOT NULL DEFAULT '{youtube,facebook,instagram}';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS local_dir text;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS public_url text;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_status_check;
ALTER TABLE videos ADD CONSTRAINT videos_status_check CHECK (status IN
  ('idea', 'scripted', 'rendering', 'rendered', 'approved', 'rejected', 'posting', 'posted', 'failed'));

CREATE INDEX IF NOT EXISTS videos_status_publish_idx ON videos (status, publish_at);

-- Phase 5: small key/value store for the agent's own bookkeeping (last stats run, last weekly report).
CREATE TABLE IF NOT EXISTS agent_state (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Phase 6: long-form videos and languages.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'short';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS language text;

-- Phase 6: comments on our posts, with Claude's draft replies waiting for approval.
CREATE TABLE IF NOT EXISTS comments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  external_id   text NOT NULL,      -- the platform's comment id; replies go to it
  author        text,
  text          text NOT NULL,
  commented_at  timestamptz,
  status        text NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'drafted', 'skipped', 'sent', 'ignored', 'failed')),
  draft         text,
  reply_external_id text,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, external_id)
);

CREATE INDEX IF NOT EXISTS comments_status_idx ON comments (status);

-- Recommendations: hook-style experiments.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS hook_style text;

-- Local mode: PUBLISH_MODE=manual exports videos for uploading by hand instead of posting them.
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_status_check;
ALTER TABLE posts ADD CONSTRAINT posts_status_check CHECK (status IN
  ('scheduled', 'uploading', 'processing', 'published', 'failed', 'exported'));
