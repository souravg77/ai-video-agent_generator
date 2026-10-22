import { db, type Platform } from "../lib/db.js";
import { facebookStats, instagramStats, youtubeStats, youtubeWatchTime, type Stats } from "./fetchers.js";

export type StatsFetchers = {
  youtube: (ids: string[]) => Promise<Map<string, Stats>>;
  facebook: (id: string) => Promise<Stats>;
  instagram: (id: string) => Promise<Stats>;
};

export type CollectResult = { saved: number; errors: string[] };

// Watch time is a bonus: sign-ins from before phase 5 lack the analytics scope, so keep the counts without it.
export function defaultFetchers(now: Date, onNote: (m: string) => void = () => {}): StatsFetchers {
  return {
    youtube: async (ids) => {
      const stats = await youtubeStats(ids);
      try {
        const watch = await youtubeWatchTime(ids, now);
        for (const [id, sec] of watch) stats.set(id, { ...stats.get(id), watchTimeSec: sec });
      } catch (err) {
        onNote(`YouTube watch time skipped (${(err as Error).message}). Run \`npm run auth:youtube\` again to grant analytics access.`);
      }
      return stats;
    },
    facebook: facebookStats,
    instagram: instagramStats,
  };
}

type LivePost = { id: string; platform: Platform; external_id: string };

// Takes one snapshot of every live post from the last `maxAgeDays` days into post_stats.
// One platform failing doesn't stop the others; the errors come back for the caller to report.
export async function collectStats(now: Date, fetchers: StatsFetchers = defaultFetchers(now), maxAgeDays = 30): Promise<CollectResult> {
  const { rows } = await db().query<LivePost>(
    `SELECT id, platform, external_id FROM posts
      WHERE status IN ('published', 'scheduled') AND external_id IS NOT NULL
        AND COALESCE(scheduled_for, published_at, created_at) BETWEEN $1 AND $2`,
    [new Date(now.getTime() - maxAgeDays * 86400_000), now],
  );
  const result: CollectResult = { saved: 0, errors: [] };
  const found = new Map<string, Stats>();

  const yt = rows.filter((p) => p.platform === "youtube");
  if (yt.length) {
    try {
      const stats = await fetchers.youtube(yt.map((p) => p.external_id));
      for (const p of yt) if (stats.has(p.external_id)) found.set(p.id, stats.get(p.external_id)!);
    } catch (err) {
      result.errors.push(`youtube: ${(err as Error).message}`);
    }
  }
  for (const p of rows.filter((r) => r.platform !== "youtube")) {
    try {
      found.set(p.id, await fetchers[p.platform as "facebook" | "instagram"](p.external_id));
    } catch (err) {
      result.errors.push(`${p.platform} ${p.external_id}: ${(err as Error).message}`);
    }
  }

  for (const [postId, s] of found) {
    const { rowCount } = await db().query(
      `INSERT INTO post_stats (post_id, captured_at, views, likes, comments, shares, watch_time_sec)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
      [postId, now, s.views ?? null, s.likes ?? null, s.comments ?? null, s.shares ?? null, s.watchTimeSec ?? null],
    );
    result.saved += rowCount ?? 0;
  }
  return result;
}
