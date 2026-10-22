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
