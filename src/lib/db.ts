import pg from "pg";
import { config } from "../config.js";

let pool: pg.Pool | undefined;

export function dbConfigured(): boolean {
  return Boolean(config.DATABASE_URL);
}

function db(): pg.Pool {
  if (!config.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  pool ??= new pg.Pool({ connectionString: config.DATABASE_URL });
  return pool;
}

export async function createVideo(topic: string): Promise<string> {
  const { rows } = await db().query<{ id: string }>("INSERT INTO videos (topic, status) VALUES ($1, 'scripted') RETURNING id", [topic]);
  return rows[0].id;
}

type VideoUpdate = Partial<{
  status: string;
  script: unknown;
  title: string;
  description: string;
  hashtags: string[];
  storage_key: string;
  duration_sec: number;
  error: string;
}>;

const COLUMNS = new Set(["status", "script", "title", "description", "hashtags", "storage_key", "duration_sec", "error"]);

export async function updateVideo(id: string, fields: VideoUpdate): Promise<void> {
  const entries = Object.entries(fields).filter(([k, v]) => COLUMNS.has(k) && v !== undefined);
  if (entries.length === 0) return;
  const sets = entries.map(([k], i) => `${k} = $${i + 2}`).join(", ");
  const values = entries.map(([k, v]) => (k === "script" ? JSON.stringify(v) : v));
  await db().query(`UPDATE videos SET ${sets}, updated_at = now() WHERE id = $1`, [id, ...values]);
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

export type Platform = "youtube" | "facebook" | "instagram";

// One row per (video, platform); re-posting the same video overwrites the previous attempt.
export async function upsertPost(
  videoId: string,
  platform: Platform,
  fields: { status: string; scheduled_for?: Date; external_id?: string; url?: string; error?: string; published_at?: Date },
): Promise<void> {
  await db().query(
    `INSERT INTO posts (video_id, platform, status, scheduled_for, external_id, url, error, published_at, attempts)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)
     ON CONFLICT (video_id, platform) DO UPDATE SET
       status = EXCLUDED.status,
       scheduled_for = COALESCE(EXCLUDED.scheduled_for, posts.scheduled_for),
       external_id = COALESCE(EXCLUDED.external_id, posts.external_id),
       url = COALESCE(EXCLUDED.url, posts.url),
       error = EXCLUDED.error,
       published_at = COALESCE(EXCLUDED.published_at, posts.published_at),
       attempts = posts.attempts + CASE WHEN EXCLUDED.status = 'uploading' THEN 1 ELSE 0 END`,
    [videoId, platform, fields.status, fields.scheduled_for ?? null, fields.external_id ?? null, fields.url ?? null, fields.error ?? null, fields.published_at ?? null],
  );
}
