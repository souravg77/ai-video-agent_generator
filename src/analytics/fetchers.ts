import { google, type youtube_v3, type youtubeAnalytics_v2 } from "googleapis";
import { config } from "../config.js";
import { graphGet } from "../lib/graph.js";
import { googleAuth } from "../lib/youtube.js";

export type Stats = { views?: number; likes?: number; comments?: number; shares?: number; watchTimeSec?: number };

const num = (v: unknown) => (v == null || v === "" ? undefined : Number(v));

// ---------- YouTube ----------

// videos.list costs 1 quota unit per call of up to 50 ids.
export async function youtubeStats(ids: string[], client?: youtube_v3.Youtube): Promise<Map<string, Stats>> {
  const yt = client ?? google.youtube({ version: "v3", auth: googleAuth() });
  const out = new Map<string, Stats>();
  for (let i = 0; i < ids.length; i += 50) {
    const res = await yt.videos.list({ part: ["statistics"], id: ids.slice(i, i + 50), maxResults: 50 });
    for (const v of res.data.items ?? []) {
      out.set(v.id!, { views: num(v.statistics?.viewCount), likes: num(v.statistics?.likeCount), comments: num(v.statistics?.commentCount) });
    }
  }
  return out;
}

// Watch time needs the yt-analytics.readonly scope; older sign-ins without it just skip this.
export async function youtubeWatchTime(ids: string[], today: Date, client?: youtubeAnalytics_v2.Youtubeanalytics): Promise<Map<string, number>> {
  const ya = client ?? google.youtubeAnalytics({ version: "v2", auth: googleAuth() });
  const out = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 200) {
    const res = await ya.reports.query({
      ids: "channel==MINE",
      startDate: "2020-01-01",
      endDate: today.toISOString().slice(0, 10),
      metrics: "estimatedMinutesWatched",
      dimensions: "video",
      filters: `video==${ids.slice(i, i + 200).join(",")}`,
    });
    for (const row of res.data.rows ?? []) out.set(String(row[0]), Math.round(Number(row[1]) * 60));
  }
  return out;
}

// ---------- Instagram ----------

type Insights = { data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] };
const insightValue = (i: Insights, name: string) => {
  const m = i.data.find((d) => d.name === name);
  return m ? (m.total_value?.value ?? m.values?.[0]?.value) : undefined;
};

export async function instagramStats(mediaId: string): Promise<Stats> {
  const token = config.META_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error("Instagram is not connected.");
  const metrics = ["views", "likes", "comments", "shares", "ig_reels_video_view_total_time"];
  let insights: Insights;
  try {
    insights = await graphGet<Insights>(`${mediaId}/insights`, { metric: metrics.join(","), access_token: token });
  } catch {
    // Metric names change between Graph API versions; fall back to the long-standing ones.
    insights = await graphGet<Insights>(`${mediaId}/insights`, { metric: "reach,likes,comments,shares", access_token: token });
  }
  const totalMs = insightValue(insights, "ig_reels_video_view_total_time");
  return {
    views: insightValue(insights, "views") ?? insightValue(insights, "reach"),
    likes: insightValue(insights, "likes"),
    comments: insightValue(insights, "comments"),
    shares: insightValue(insights, "shares"),
    watchTimeSec: totalMs == null ? undefined : Math.round(totalMs / 1000),
  };
}

// ---------- Facebook ----------

export async function facebookStats(videoId: string): Promise<Stats> {
  const token = config.META_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error("Facebook is not connected.");
  const counts = await graphGet<{ likes?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } } }>(videoId, {
    fields: "likes.summary(true).limit(0),comments.summary(true).limit(0)",
    access_token: token,
  });
  const stats: Stats = { likes: counts.likes?.summary?.total_count, comments: counts.comments?.summary?.total_count };
  try {
    const insights = await graphGet<Insights>(`${videoId}/video_insights`, { metric: "blue_reels_play_count,post_video_view_time", access_token: token });
    stats.views = insightValue(insights, "blue_reels_play_count");
    const ms = insightValue(insights, "post_video_view_time");
    stats.watchTimeSec = ms == null ? undefined : Math.round(ms / 1000);
  } catch {
    // Reels insights aren't available for every Page or video yet; keep likes and comments.
  }
  return stats;
}
