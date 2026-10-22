import { db, type Platform } from "../lib/db.js";

export type PlatformNumbers = { views: number; likes: number; comments: number; watchTimeSec: number; url: string | null };

export type ReportVideo = {
  id: string;
  title: string;
  postedAt: Date;
  costUsd: number;
  views: number;
  platforms: Partial<Record<Platform, PlatformNumbers>>;
};

export type Report = {
  from: Date;
  to: Date;
  videos: ReportVideo[]; // posted in the window, most viewed first
  byPlatform: Partial<Record<Platform, { posts: number; views: number; likes: number; comments: number; watchTimeSec: number }>>;
  totals: { videos: number; views: number; likes: number; comments: number; watchTimeSec: number; costUsd: number; costPer1kViews: number | null };
  rejected: { count: number; costUsd: number };
  upcoming: { title: string; publishAt: Date | null; status: string }[];
};

type Row = {
  video_id: string;
  title: string;
  cost_usd: string;
  platform: Platform;
  url: string | null;
  posted_at: Date;
  views: string | null;
  likes: string | null;
  comments: string | null;
  watch_time_sec: string | null;
};

const n = (v: string | null) => (v == null ? 0 : Number(v));

// Numbers are the latest snapshot per post, so a video posted on Monday shows its views up to now.
export async function buildReport(now: Date, days = 7): Promise<Report> {
  const from = new Date(now.getTime() - days * 86400_000);
  const { rows } = await db().query<Row>(
    `SELECT v.id AS video_id, COALESCE(v.title, v.topic) AS title, v.cost_usd, p.platform, p.url,
            COALESCE(p.scheduled_for, p.published_at, p.created_at) AS posted_at,
            s.views, s.likes, s.comments, s.watch_time_sec
       FROM posts p
       JOIN videos v ON v.id = p.video_id
       LEFT JOIN LATERAL (SELECT * FROM post_stats x WHERE x.post_id = p.id ORDER BY captured_at DESC LIMIT 1) s ON true
      WHERE p.status IN ('published', 'scheduled')
        AND COALESCE(p.scheduled_for, p.published_at, p.created_at) BETWEEN $1 AND $2`,
    [from, now],
  );

  const videos = new Map<string, ReportVideo>();
  const byPlatform: Report["byPlatform"] = {};
  for (const r of rows) {
    const nums: PlatformNumbers = { views: n(r.views), likes: n(r.likes), comments: n(r.comments), watchTimeSec: n(r.watch_time_sec), url: r.url };
    const v = videos.get(r.video_id) ?? { id: r.video_id, title: r.title, postedAt: r.posted_at, costUsd: Number(r.cost_usd), views: 0, platforms: {} };
    v.platforms[r.platform] = nums;
    v.views += nums.views;
    if (r.posted_at < v.postedAt) v.postedAt = r.posted_at;
    videos.set(r.video_id, v);

    const p = (byPlatform[r.platform] ??= { posts: 0, views: 0, likes: 0, comments: 0, watchTimeSec: 0 });
    p.posts++;
    p.views += nums.views;
    p.likes += nums.likes;
    p.comments += nums.comments;
    p.watchTimeSec += nums.watchTimeSec;
  }

  const list = [...videos.values()].sort((a, b) => b.views - a.views);
  const sum = (f: (p: NonNullable<Report["byPlatform"][Platform]>) => number) => Object.values(byPlatform).reduce((t, p) => t + f(p!), 0);
  const views = sum((p) => p.views);
  const costUsd = list.reduce((t, v) => t + v.costUsd, 0);

  const rejected = await db().query<{ count: string; cost: string | null }>(
    "SELECT count(*) AS count, SUM(cost_usd) AS cost FROM videos WHERE status = 'rejected' AND updated_at BETWEEN $1 AND $2",
    [from, now],
  );
  const upcoming = await db().query<{ title: string; publish_at: Date | null; status: string }>(
    `SELECT COALESCE(title, topic) AS title, publish_at, status FROM videos
      WHERE status IN ('idea', 'rendering', 'rendered', 'approved', 'posting') ORDER BY publish_at NULLS LAST LIMIT 14`,
  );

  return {
    from,
    to: now,
    videos: list,
    byPlatform,
    totals: {
      videos: list.length,
      views,
      likes: sum((p) => p.likes),
      comments: sum((p) => p.comments),
      watchTimeSec: sum((p) => p.watchTimeSec),
      costUsd,
      costPer1kViews: views ? (costUsd / views) * 1000 : null,
    },
    rejected: { count: Number(rejected.rows[0].count), costUsd: n(rejected.rows[0].cost) },
    upcoming: upcoming.rows.map((r) => ({ title: r.title, publishAt: r.publish_at, status: r.status })),
  };
}

const int = (x: number) => Math.round(x).toLocaleString("en-US");
const usd = (x: number) => `$${x.toFixed(x < 1 ? 3 : 2)}`;
const day = (d: Date) => d.toISOString().slice(0, 10);
export const hours = (sec: number) => (sec >= 3600 ? `${(sec / 3600).toFixed(1)} h` : `${Math.round(sec / 60)} min`);

// Plain text with light markdown, short enough for a Slack or Discord message.
export function reportText(r: Report): string {
  const t = r.totals;
  const lines = [
    `**Weekly video report** (${day(r.from)} to ${day(r.to)})`,
    `${t.videos} video(s) posted · ${int(t.views)} views · ${int(t.likes)} likes · ${int(t.comments)} comments${t.watchTimeSec ? ` · ${hours(t.watchTimeSec)} watched` : ""}`,
    `Spend ${usd(t.costUsd)}${t.costPer1kViews != null ? ` · ${usd(t.costPer1kViews)} per 1,000 views` : ""}${r.rejected.count ? ` · ${r.rejected.count} rejected (${usd(r.rejected.costUsd)})` : ""}`,
  ];
  const platforms = Object.entries(r.byPlatform).map(([p, s]) => `${p} ${int(s!.views)}`);
  if (platforms.length) lines.push(`Views by platform: ${platforms.join(" · ")}`);
  if (r.videos.length) {
    lines.push("", "Top:");
    for (const v of r.videos.slice(0, 3)) lines.push(`• ${v.title}: ${int(v.views)} views`);
  }
  if (r.videos.length > 3) {
    lines.push("Weakest:");
    for (const v of r.videos.slice(-Math.min(3, r.videos.length - 3)).reverse()) lines.push(`• ${v.title}: ${int(v.views)} views`);
  }
  lines.push("", r.upcoming.length ? `Next up: ${r.upcoming.slice(0, 3).map((u) => u.title).join("; ")}` : "Nothing planned yet.");
  return lines.join("\n");
}
