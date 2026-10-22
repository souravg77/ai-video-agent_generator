import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { google, type youtube_v3 } from "googleapis";
import { config } from "../config.js";

export type Privacy = "private" | "unlisted" | "public";

export type YouTubeMetadataInput = {
  title: string;
  description: string;
  hashtags: string[];
  privacy?: Privacy;
  publishAt?: Date;
  // Set when the video contains realistic AI-generated or altered footage (YouTube's disclosure rule).
  containsSyntheticMedia?: boolean;
  categoryId?: string;
  // Long (16:9) videos don't get the #Shorts tag
  long?: boolean;
  now?: Date;
};

// YouTube limits: title 100 chars, description 5000 bytes, tags 500 chars total; < and > are rejected.
const TITLE_MAX = 100;
const DESCRIPTION_MAX_BYTES = 5000;
const TAGS_MAX_CHARS = 500;
const DEFAULT_CATEGORY = "22"; // People & Blogs

const stripAngles = (s: string) => s.replace(/[<>]/g, "");

function truncateBytes(s: string, maxBytes: number): string {
  const buf = Buffer.from(s, "utf8");
  if (buf.length <= maxBytes) return s;
  // Cut on a character boundary.
  let end = maxBytes;
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end--;
  return buf.subarray(0, end).toString("utf8");
}

// YouTube counts each tag's length, plus 2 for quotes when it contains a space, plus a comma between tags.
export function fitTags(tags: string[]): string[] {
  const out: string[] = [];
  let used = 0;
  for (const tag of tags) {
    const cost = tag.length + (tag.includes(" ") ? 2 : 0) + (out.length ? 1 : 0);
    if (used + cost > TAGS_MAX_CHARS) break;
    out.push(tag);
    used += cost;
  }
  return out;
}

export function buildYouTubeMetadata(input: YouTubeMetadataInput): youtube_v3.Schema$Video {
  const now = input.now ?? new Date();
  if (input.publishAt && input.publishAt.getTime() <= now.getTime()) {
    throw new Error(`publishAt must be in the future (got ${input.publishAt.toISOString()}).`);
  }

  const hashtags = [...new Set(input.hashtags.map((h) => h.replace(/^#/, "").replace(/\s+/g, "")).filter(Boolean))];
  if (!input.long && !hashtags.some((h) => h.toLowerCase() === "shorts")) hashtags.unshift("Shorts");

  const title = stripAngles(input.title).trim().slice(0, TITLE_MAX) || "Untitled";
  const hashtagLine = hashtags.map((h) => `#${h}`).join(" ");
  const description = truncateBytes(stripAngles(`${input.description.trim()}\n\n${hashtagLine}`), DESCRIPTION_MAX_BYTES);

  return {
    snippet: {
      title,
      description,
      tags: fitTags(hashtags.filter((h) => h.toLowerCase() !== "shorts")),
      categoryId: input.categoryId ?? DEFAULT_CATEGORY,
    },
    status: {
      // A scheduled video must be uploaded as private; YouTube flips it to public at publishAt.
      privacyStatus: input.publishAt ? "private" : (input.privacy ?? "private"),
      publishAt: input.publishAt?.toISOString(),
      selfDeclaredMadeForKids: false,
      containsSyntheticMedia: input.containsSyntheticMedia ?? false,
    },
  };
}

export function googleAuth() {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.YOUTUBE_REFRESH_TOKEN) {
    throw new Error("YouTube is not connected. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then run `npm run auth:youtube`.");
  }
  const auth = new google.auth.OAuth2(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: config.YOUTUBE_REFRESH_TOKEN });
  return auth;
}

export function youtubeClient(): youtube_v3.Youtube {
  return google.youtube({ version: "v3", auth: googleAuth() });
}

type ApiError = { code?: number | string; status?: number; message?: string; errors?: { reason?: string }[]; response?: { data?: { error?: string } } };

// Turns Google API errors into messages that say what to do next.
export function explainYouTubeError(err: unknown): Error {
  const e = err as ApiError;
  const reason = e.errors?.[0]?.reason;
  if (e.response?.data?.error === "invalid_grant" || e.message?.includes("invalid_grant")) {
    return new Error("YouTube sign-in expired or was revoked. Run `npm run auth:youtube` again. (In Testing mode Google expires it after 7 days.)");
  }
  if (reason === "quotaExceeded") return new Error("YouTube API daily quota is used up (an upload costs about 1,600 of the default 10,000 units). Try again after midnight Pacific time.");
  if (reason === "uploadLimitExceeded") return new Error("This channel hit YouTube's upload limit for now. Try again later.");
  if (reason === "invalidPublishAt") return new Error("YouTube rejected the scheduled time. Use a future time in ISO format, e.g. 2026-11-01T15:00:00Z.");
  return err instanceof Error ? err : new Error(String(err));
}

function isRetryable(err: unknown): boolean {
  const e = err as ApiError & { code?: string | number };
  const status = Number(e.status ?? e.code);
  return (status >= 500 && status < 600) || ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(String(e.code));
}

export type UploadResult = { videoId: string; url: string; privacyStatus: string; publishAt?: string };

export async function uploadToYouTube(
  filePath: string,
  metadata: youtube_v3.Schema$Video,
  opts: { client?: youtube_v3.Youtube; onProgress?: (fraction: number) => void; retries?: number; long?: boolean } = {},
): Promise<UploadResult> {
  const yt = opts.client ?? youtubeClient();
  const { size } = await stat(filePath);
  const retries = opts.retries ?? 3;

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await yt.videos.insert(
        { part: ["snippet", "status"], notifySubscribers: true, requestBody: metadata, media: { mimeType: "video/mp4", body: createReadStream(filePath) } },
        { onUploadProgress: (evt: { bytesRead: number }) => opts.onProgress?.(Math.min(1, evt.bytesRead / size)) },
      );
      const id = res.data.id;
      if (!id) throw new Error("YouTube accepted the upload but returned no video id.");
      return {
        videoId: id,
        url: opts.long ? `https://www.youtube.com/watch?v=${id}` : `https://youtube.com/shorts/${id}`,
        privacyStatus: res.data.status?.privacyStatus ?? "unknown",
        publishAt: res.data.status?.publishAt ?? undefined,
      };
    } catch (err) {
      if (attempt >= retries || !isRetryable(err)) throw explainYouTubeError(err);
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}
