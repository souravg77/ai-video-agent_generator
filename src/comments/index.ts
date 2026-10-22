import { db, type Platform } from "../lib/db.js";
import type { Drafter } from "./drafts.js";
import type { CommentPlatforms } from "./platforms.js";

export type CommentRow = {
  id: string;
  platform: Platform;
  external_id: string;
  author: string | null;
  text: string;
  commented_at: Date | null;
  status: string;
  draft: string | null;
  error: string | null;
  video_title: string;
  post_url: string | null;
};

export type CheckResult = { found: number; drafted: number; skipped: number; errors: string[] };

const REPLY_MAX = 1000;

// Pulls new comments on posts from the last `maxAgeDays` days and has Claude draft replies to them.
// Nothing is posted here; replies go out only when approved on the review page.
export async function checkComments(now: Date, platforms: CommentPlatforms, drafter: Drafter, maxAgeDays = 14): Promise<CheckResult> {
  const result: CheckResult = { found: 0, drafted: 0, skipped: 0, errors: [] };
  const { rows: posts } = await db().query<{ id: string; platform: Platform; external_id: string }>(
    `SELECT id, platform, external_id FROM posts
      WHERE status IN ('published', 'scheduled') AND external_id IS NOT NULL
        AND COALESCE(scheduled_for, published_at, created_at) BETWEEN $1 AND $2`,
    [new Date(now.getTime() - maxAgeDays * 86400_000), now],
  );
  for (const p of posts) {
    try {
      for (const c of await platforms.fetch(p.platform, p.external_id)) {
        const { rowCount } = await db().query(
          `INSERT INTO comments (post_id, external_id, author, text, commented_at) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (post_id, external_id) DO NOTHING`,
          [p.id, c.externalId, c.author ?? null, c.text, c.commentedAt ?? null],
        );
        result.found += rowCount ?? 0;
      }
    } catch (err) {
      result.errors.push(`${p.platform} comments: ${(err as Error).message}`);
    }
  }

  // Draft per video, so Claude sees the video's context once.
  const { rows: fresh } = await db().query<{ id: string; author: string | null; text: string; video_id: string; title: string; description: string }>(
    `SELECT c.id, c.author, c.text, v.id AS video_id, COALESCE(v.title, v.topic) AS title, COALESCE(v.description, '') AS description
       FROM comments c JOIN posts p ON p.id = c.post_id JOIN videos v ON v.id = p.video_id
      WHERE c.status = 'new' ORDER BY c.created_at LIMIT 200`,
  );
  const byVideo = new Map<string, typeof fresh>();
  for (const c of fresh) byVideo.set(c.video_id, [...(byVideo.get(c.video_id) ?? []), c]);
  for (const group of byVideo.values()) {
    try {
      const drafts = await drafter({
        video: { title: group[0].title, description: group[0].description },
        comments: group.map((c) => ({ id: c.id, author: c.author ?? undefined, text: c.text })),
      });
      for (const c of group) {
        const draft = drafts.get(c.id)?.slice(0, REPLY_MAX);
        await db().query("UPDATE comments SET status = $2, draft = $3, updated_at = now() WHERE id = $1", [c.id, draft ? "drafted" : "skipped", draft || null]);
        if (draft) result.drafted++;
        else result.skipped++;
      }
    } catch (err) {
      result.errors.push(`drafting replies for "${group[0].title}": ${(err as Error).message}`);
    }
  }
  return result;
}

export async function pendingReplies(limit = 50): Promise<CommentRow[]> {
  const { rows } = await db().query<CommentRow>(
    `SELECT c.id, p.platform, c.external_id, c.author, c.text, c.commented_at, c.status, c.draft, c.error,
            COALESCE(v.title, v.topic) AS video_title, p.url AS post_url
       FROM comments c JOIN posts p ON p.id = c.post_id JOIN videos v ON v.id = p.video_id
      WHERE c.status IN ('drafted', 'failed') ORDER BY c.commented_at DESC NULLS LAST LIMIT $1`,
    [limit],
  );
  return rows;
}

// Posts the (possibly edited) reply. Marks it sent first so a double click can't post twice.
export async function sendReply(id: string, text: string, platforms: CommentPlatforms): Promise<{ ok: boolean; message: string }> {
  const reply = text.trim().slice(0, REPLY_MAX);
  if (!reply) return { ok: false, message: "The reply is empty." };
  const { rows } = await db().query<{ platform: Platform; external_id: string }>(
    `UPDATE comments c SET status = 'sent', draft = $2, error = NULL, updated_at = now()
       FROM posts p WHERE c.id = $1 AND p.id = c.post_id AND c.status IN ('drafted', 'failed', 'skipped')
     RETURNING p.platform, c.external_id`,
    [id, reply],
  );
  if (!rows[0]) return { ok: false, message: "That comment was already handled." };
  try {
    const replyId = await platforms.reply(rows[0].platform, rows[0].external_id, reply);
    await db().query("UPDATE comments SET reply_external_id = $2 WHERE id = $1", [id, replyId]);
    return { ok: true, message: `Reply posted on ${rows[0].platform}.` };
  } catch (err) {
    const message = (err as Error).message;
    await db().query("UPDATE comments SET status = 'failed', error = $2, updated_at = now() WHERE id = $1", [id, message]);
    return { ok: false, message: `Couldn't post the reply: ${message}` };
  }
}

export async function ignoreComment(id: string): Promise<boolean> {
  const { rowCount } = await db().query("UPDATE comments SET status = 'ignored', updated_at = now() WHERE id = $1 AND status IN ('drafted', 'failed', 'skipped')", [id]);
  return (rowCount ?? 0) > 0;
}
