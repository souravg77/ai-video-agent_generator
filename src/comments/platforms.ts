import { google, type youtube_v3 } from "googleapis";
import { config } from "../config.js";
import type { Platform } from "../lib/db.js";
import { graphGet, graphPost } from "../lib/graph.js";
import { googleAuth } from "../lib/youtube.js";

export type FetchedComment = { externalId: string; author?: string; text: string; commentedAt?: Date };

export type CommentPlatforms = {
  fetch: (platform: Platform, postExternalId: string) => Promise<FetchedComment[]>;
  reply: (platform: Platform, commentExternalId: string, text: string) => Promise<string>;
};

const token = () => {
  if (!config.META_PAGE_ACCESS_TOKEN) throw new Error("Meta is not connected. Run `npm run auth:meta`.");
  return config.META_PAGE_ACCESS_TOKEN;
};

// ---------- YouTube (commentThreads.list costs 1 quota unit, a reply costs 50) ----------

export async function youtubeComments(videoId: string, client?: youtube_v3.Youtube): Promise<FetchedComment[]> {
  const yt = client ?? google.youtube({ version: "v3", auth: googleAuth() });
  const res = await yt.commentThreads.list({ part: ["snippet"], videoId, maxResults: 50, order: "time", textFormat: "plainText" });
  return (res.data.items ?? [])
    .filter((t) => t.snippet?.canReply !== false)
    .map((t) => ({ channel: t.snippet?.channelId, c: t.snippet?.topLevelComment }))
    .filter(({ channel, c }) => c?.id && c.snippet?.authorChannelId?.value !== channel) // skip our own comments
    .map(({ c }) => ({
      externalId: c!.id!,
      author: c!.snippet?.authorDisplayName ?? undefined,
      text: c!.snippet?.textOriginal ?? c!.snippet?.textDisplay ?? "",
      commentedAt: c!.snippet?.publishedAt ? new Date(c!.snippet.publishedAt) : undefined,
    }));
}

export async function youtubeReply(parentId: string, text: string, client?: youtube_v3.Youtube): Promise<string> {
  const yt = client ?? google.youtube({ version: "v3", auth: googleAuth() });
  const res = await yt.comments.insert({ part: ["snippet"], requestBody: { snippet: { parentId, textOriginal: text } } });
  if (!res.data.id) throw new Error("YouTube accepted the reply but returned no id.");
  return res.data.id;
}

// ---------- Instagram ----------

let ownUsername: string | undefined;

export async function instagramComments(mediaId: string): Promise<FetchedComment[]> {
  ownUsername ??= config.META_IG_USER_ID
    ? (await graphGet<{ username?: string }>(config.META_IG_USER_ID, { fields: "username", access_token: token() })).username
    : undefined;
  const res = await graphGet<{ data: { id: string; text?: string; username?: string; timestamp?: string }[] }>(`${mediaId}/comments`, {
    fields: "id,text,username,timestamp",
    limit: "50",
    access_token: token(),
  });
  return res.data
    .filter((c) => c.text && c.username !== ownUsername)
    .map((c) => ({ externalId: c.id, author: c.username, text: c.text!, commentedAt: c.timestamp ? new Date(c.timestamp) : undefined }));
}

// ---------- Facebook ----------

export async function facebookComments(videoId: string): Promise<FetchedComment[]> {
  const res = await graphGet<{ data: { id: string; message?: string; from?: { id: string; name?: string }; created_time?: string }[] }>(`${videoId}/comments`, {
    fields: "id,message,from{id,name},created_time",
    filter: "toplevel",
    order: "reverse_chronological",
    limit: "50",
    access_token: token(),
  });
  return res.data
    .filter((c) => c.message && c.from?.id !== config.META_PAGE_ID)
    .map((c) => ({ externalId: c.id, author: c.from?.name, text: c.message!, commentedAt: c.created_time ? new Date(c.created_time) : undefined }));
}

export const realPlatforms: CommentPlatforms = {
  fetch: (platform, id) => (platform === "youtube" ? youtubeComments(id) : platform === "instagram" ? instagramComments(id) : facebookComments(id)),
  reply: async (platform, commentId, text) => {
    if (platform === "youtube") return youtubeReply(commentId, text);
    const path = platform === "instagram" ? `${commentId}/replies` : `${commentId}/comments`;
    return (await graphPost<{ id: string }>(path, { message: text, access_token: token() })).id;
  },
};
