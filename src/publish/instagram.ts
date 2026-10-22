import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";
import { buildCaption, postInstagramReel, type PollOptions } from "../lib/meta.js";
import { storageConfigured, uploadFile } from "../lib/storage.js";
import { recordPost, type PostOutcome } from "./record.js";
import type { RenderedRun } from "./run-dir.js";

// Instagram pulls the video from a public URL, so make sure one exists.
async function publicUrl(run: RenderedRun): Promise<string> {
  if (run.url?.startsWith("https://")) return run.url;
  if (!storageConfigured()) throw new Error("Instagram needs the video at a public URL. Set up R2 storage (docs/phase0-setup.md step 4).");
  const key = `videos/${run.videoId ?? run.dir.split(/[\\/]/).at(-1)}.mp4`;
  run.url = await uploadFile(run.videoPath, key, "video/mp4");
  if (!run.url.startsWith("https://")) throw new Error("R2_PUBLIC_BASE_URL is not set, so Instagram can't download the video.");
  return run.url;
}

export async function postToInstagram(run: RenderedRun, opts: { poll?: PollOptions } = {}): Promise<PostOutcome> {
  if (!config.META_IG_USER_ID || !config.META_PAGE_ACCESS_TOKEN) {
    throw new Error("Instagram is not connected. Run `npm run auth:meta` (see docs/phase0-setup.md step 3).");
  }
  const caption = buildCaption(run.script.description, run.script.hashtags);
  const out = await recordPost(run, "instagram", undefined, async () => {
    const r = await postInstagramReel(await publicUrl(run), caption, opts);
    return { externalId: r.mediaId, url: r.url };
  });
  await writeFile(join(run.dir, "instagram.json"), JSON.stringify(out, null, 2));
  return out;
}
