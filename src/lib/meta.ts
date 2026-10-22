import { readFile, stat } from "node:fs/promises";
import { config } from "../config.js";
import { graphGet, graphPost, ruploadPost } from "./graph.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Instagram captions: 2,200 characters and 30 hashtags at most.
export function buildCaption(description: string, hashtags: string[], maxChars = 2200, maxTags = 30): string {
  const tags = [...new Set(hashtags.map((h) => h.replace(/^#/, "").replace(/\s+/g, "")).filter(Boolean))].slice(0, maxTags);
  const tagLine = tags.map((t) => `#${t}`).join(" ");
  const room = maxChars - (tagLine ? tagLine.length + 2 : 0);
  const body = description.trim().length > room ? `${description.trim().slice(0, Math.max(0, room - 1))}…` : description.trim();
  return tagLine ? `${body}\n\n${tagLine}` : body;
}

export type PollOptions = { intervalMs?: number; timeoutMs?: number };

// ---------- Facebook Page Reels ----------

export type FacebookReelResult = { videoId: string; url: string; scheduledFor?: string };

// Facebook allows scheduling a Reel between 10 minutes and 29 days ahead.
export function validateFacebookSchedule(when: Date, now = new Date()): void {
  const ahead = when.getTime() - now.getTime();
  if (ahead < 10 * 60_000) throw new Error("Facebook can only schedule Reels at least 10 minutes ahead.");
  if (ahead > 29 * 24 * 3600_000) throw new Error("Facebook can only schedule Reels up to 29 days ahead.");
}

export async function postFacebookReel(
  filePath: string,
  description: string,
  opts: { scheduleAt?: Date; poll?: PollOptions; now?: Date } = {},
): Promise<FacebookReelResult> {
  const pageId = config.META_PAGE_ID;
  const token = config.META_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) throw new Error("Facebook is not connected. Run `npm run auth:meta` (see docs/phase0-setup.md step 3).");
  if (opts.scheduleAt) validateFacebookSchedule(opts.scheduleAt, opts.now);

  // 1. Start an upload session.
  const start = await graphPost<{ video_id: string; upload_url: string }>(`${pageId}/video_reels`, { upload_phase: "start", access_token: token });

  // 2. Send the file bytes.
  const bytes = await readFile(filePath);
  const { size } = await stat(filePath);
  const sent = await ruploadPost<{ success?: boolean }>(start.upload_url, { Authorization: `OAuth ${token}`, offset: "0", file_size: String(size) }, bytes);
  if (sent.success === false) throw new Error("Facebook did not accept the video upload.");

  // 3. Finish: publish now or schedule.
  await graphPost(`${pageId}/video_reels`, {
    upload_phase: "finish",
    access_token: token,
    video_id: start.video_id,
    description,
    ...(opts.scheduleAt
      ? { video_state: "SCHEDULED", scheduled_publish_time: String(Math.floor(opts.scheduleAt.getTime() / 1000)) }
      : { video_state: "PUBLISHED" }),
  });

  // 4. Wait until Facebook finishes processing, so failures surface here instead of silently.
  await waitForFacebookVideo(start.video_id, token, opts.poll);
  return { videoId: start.video_id, url: `https://www.facebook.com/reel/${start.video_id}`, scheduledFor: opts.scheduleAt?.toISOString() };
}

type FbStatus = { status?: { video_status?: string; processing_phase?: { status?: string; error?: { message?: string } } } };

async function waitForFacebookVideo(videoId: string, token: string, poll: PollOptions = {}): Promise<void> {
  const deadline = Date.now() + (poll.timeoutMs ?? 10 * 60_000);
  for (;;) {
    const { status } = await graphGet<FbStatus>(videoId, { fields: "status", access_token: token });
    if (status?.video_status === "error" || status?.processing_phase?.status === "error") {
      throw new Error(`Facebook could not process the video: ${status.processing_phase?.error?.message ?? "unknown error"}`);
    }
    if (status?.video_status === "ready" || status?.processing_phase?.status === "complete") return;
    if (Date.now() > deadline) throw new Error(`Facebook is still processing video ${videoId}; check it in Meta Business Suite.`);
    await sleep(poll.intervalMs ?? 5000);
  }
}

// ---------- Instagram Reels ----------

export type InstagramReelResult = { mediaId: string; url?: string };

export async function postInstagramReel(videoUrl: string, caption: string, opts: { poll?: PollOptions } = {}): Promise<InstagramReelResult> {
  const igId = config.META_IG_USER_ID;
  const token = config.META_PAGE_ACCESS_TOKEN;
  if (!igId || !token) throw new Error("Instagram is not connected. Run `npm run auth:meta` (see docs/phase0-setup.md step 3).");
  if (!/^https:\/\//.test(videoUrl)) throw new Error("Instagram needs a public https URL for the video. Set up R2 storage with a public URL (docs/phase0-setup.md step 4).");

  // 1. Create a media container; Instagram downloads the video from videoUrl.
  const container = await graphPost<{ id: string }>(`${igId}/media`, {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    share_to_feed: "true",
    access_token: token,
  });

  // 2. Wait for processing.
  const deadline = Date.now() + (opts.poll?.timeoutMs ?? 10 * 60_000);
  for (;;) {
    const s = await graphGet<{ status_code?: string; status?: string }>(container.id, { fields: "status_code,status", access_token: token });
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`Instagram could not process the video: ${s.status ?? s.status_code}`);
    if (Date.now() > deadline) throw new Error("Instagram is still processing the video after 10 minutes; try publishing again later.");
    await sleep(opts.poll?.intervalMs ?? 5000);
  }

  // 3. Publish.
  const published = await graphPost<{ id: string }>(`${igId}/media_publish`, { creation_id: container.id, access_token: token });
  const media = await graphGet<{ permalink?: string }>(published.id, { fields: "permalink", access_token: token }).catch(() => ({ permalink: undefined }));
  return { mediaId: published.id, url: media.permalink };
}
