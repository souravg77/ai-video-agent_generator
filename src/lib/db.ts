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
