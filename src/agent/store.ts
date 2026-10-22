import { db, type Platform } from "../lib/db.js";
import type { VideoFormat } from "../pipeline/captions.js";
import type { VideoScript } from "../pipeline/script.js";

export type VideoRow = {
  id: string;
  topic: string;
  angle: string | null;
  status: string;
  script: VideoScript | null;
  title: string | null;
  description: string | null;
  hashtags: string[];
  publish_at: Date | null;
  platforms: Platform[];
  format: VideoFormat;
  language: string | null;
  local_dir: string | null;
  public_url: string | null;
  error: string | null;
  review_note: string | null;
  duration_sec: string | null;
  created_at: Date;
  updated_at: Date;
};

export type PostRow = { platform: Platform; status: string; attempts: number; url: string | null; error: string | null };

export const MAX_POST_ATTEMPTS = 3;

export async function takenSlots(from: Date): Promise<Date[]> {
  const { rows } = await db().query<{ publish_at: Date }>(
    "SELECT publish_at FROM videos WHERE publish_at >= $1 AND status NOT IN ('rejected', 'failed')",
    [from],
  );
  return rows.map((r) => r.publish_at);
}

export type NewIdea = { topic: string; angle: string; publishAt: Date; platforms: Platform[]; format?: VideoFormat };

// Long videos only go to YouTube, since Reels must be vertical.
export const platformsFor = (format: VideoFormat | undefined, platforms: Platform[]): Platform[] =>
  format === "long" ? platforms.filter((p) => p === "youtube") : platforms;

export async function insertIdeas(ideas: NewIdea[]): Promise<void> {
  for (const i of ideas) {
    const platforms = platformsFor(i.format, i.platforms);
    if (!platforms.length) throw new Error("Long videos can only be posted to YouTube; add youtube to the platforms.");
    await db().query("INSERT INTO videos (topic, angle, status, publish_at, platforms, format) VALUES ($1, $2, 'idea', $3, $4, $5)", [
      i.topic,
      i.angle,
      i.publishAt,
      platforms,
      i.format ?? "short",
    ]);
  }
}

// Recent titles with their total views across platforms (latest snapshot per post), newest first.
export async function pastVideos(limit = 30): Promise<{ title: string; views: number | null }[]> {
  const { rows } = await db().query<{ title: string; views: string | null }>(
    `SELECT COALESCE(v.title, v.topic) AS title, SUM(latest.views) AS views
       FROM videos v
       LEFT JOIN posts p ON p.video_id = v.id
       LEFT JOIN LATERAL (SELECT views FROM post_stats s WHERE s.post_id = p.id ORDER BY captured_at DESC LIMIT 1) latest ON true
      GROUP BY v.id
      ORDER BY v.created_at DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({ title: r.title, views: r.views == null ? null : Number(r.views) }));
}

export async function getState(key: string): Promise<string | undefined> {
  const { rows } = await db().query<{ value: string }>("SELECT value FROM agent_state WHERE key = $1", [key]);
  return rows[0]?.value;
}

export async function setState(key: string, value: string): Promise<void> {
  await db().query(
    "INSERT INTO agent_state (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
    [key, value],
  );
}

// Atomically moves the next eligible video from one status to another, so two workers never take the same one.
async function claim(from: string, to: string, dueBy: Date, skip: string[] = []): Promise<VideoRow | undefined> {
  const { rows } = await db().query<VideoRow>(
    `UPDATE videos SET status = $2, updated_at = now()
      WHERE id = (SELECT id FROM videos WHERE status = $1 AND publish_at <= $3 AND NOT (id = ANY($4::uuid[]))
                  ORDER BY publish_at FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING *`,
    [from, to, dueBy, skip],
  );
  return rows[0];
}

export const claimIdeaToRender = (dueBy: Date) => claim("idea", "rendering", dueBy);
export const claimApprovedToPost = (now: Date, skip: string[] = []) => claim("approved", "posting", now, skip);

// A crash mid-render or mid-post leaves a video stuck; put it back in the queue after a while.
export async function releaseStuck(olderThan: Date): Promise<number> {
  const { rowCount } = await db().query(
    `UPDATE videos SET status = CASE status WHEN 'rendering' THEN 'idea' ELSE 'approved' END, updated_at = now()
      WHERE status IN ('rendering', 'posting') AND updated_at < $1`,
    [olderThan],
  );
  return rowCount ?? 0;
}

export async function setStatus(id: string, status: string, error: string | null = null): Promise<void> {
  await db().query("UPDATE videos SET status = $2, error = $3, updated_at = now() WHERE id = $1", [id, status, error]);
}

export async function postsFor(videoId: string): Promise<PostRow[]> {
  const { rows } = await db().query<PostRow>("SELECT platform, status, attempts, url, error FROM posts WHERE video_id = $1", [videoId]);
  return rows;
}

export async function getVideo(id: string): Promise<VideoRow | undefined> {
  const { rows } = await db().query<VideoRow>("SELECT * FROM videos WHERE id = $1", [id]);
  return rows[0];
}

export async function listVideos(statuses: string[], limit = 50, order: "asc" | "desc" = "asc"): Promise<VideoRow[]> {
  const { rows } = await db().query<VideoRow>(
    `SELECT * FROM videos WHERE status = ANY($1) ORDER BY publish_at ${order === "asc" ? "ASC" : "DESC"} NULLS LAST, created_at DESC LIMIT $2`,
    [statuses, limit],
  );
  return rows;
}

export async function allPosts(videoIds: string[]): Promise<Map<string, PostRow[]>> {
  const map = new Map<string, PostRow[]>();
  if (videoIds.length === 0) return map;
  const { rows } = await db().query<PostRow & { video_id: string }>(
    "SELECT video_id, platform, status, attempts, url, error FROM posts WHERE video_id = ANY($1)",
    [videoIds],
  );
  for (const r of rows) map.set(r.video_id, [...(map.get(r.video_id) ?? []), r]);
  return map;
}

// Review actions. Each only applies from the expected status, so a stale page can't undo newer work.
export async function approve(id: string, edits: { title: string; description: string; hashtags: string[]; publishAt?: Date }): Promise<boolean> {
  const { rowCount } = await db().query(
    `UPDATE videos SET status = 'approved', title = $2, description = $3, hashtags = $4,
            publish_at = COALESCE($5, publish_at), reviewed_at = now(), updated_at = now()
      WHERE id = $1 AND status = 'rendered'`,
    [id, edits.title, edits.description, edits.hashtags, edits.publishAt ?? null],
  );
  return rowCount === 1;
}

export async function reject(id: string, note: string): Promise<boolean> {
  const { rowCount } = await db().query(
    "UPDATE videos SET status = 'rejected', review_note = $2, reviewed_at = now(), updated_at = now() WHERE id = $1 AND status IN ('rendered', 'idea')",
    [id, note || null],
  );
  return rowCount === 1;
}

// A failed render goes back to the idea queue; a failed post goes back to approved with fresh attempts.
export async function retry(id: string): Promise<boolean> {
  const v = await getVideo(id);
  if (!v || v.status !== "failed") return false;
  if (v.local_dir) {
    await db().query("UPDATE posts SET attempts = 0, status = 'failed' WHERE video_id = $1 AND status = 'failed'", [id]);
    await setStatus(id, "approved");
  } else {
    await setStatus(id, "idea");
  }
  return true;
}
