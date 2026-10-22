import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { youtube_v3 } from "googleapis";
import { dbConfigured, upsertPost } from "../lib/db.js";
import { buildYouTubeMetadata, setThumbnail, uploadToYouTube, type Privacy, type UploadResult } from "../lib/youtube.js";
import type { RenderedRun } from "./run-dir.js";

export type PostToYouTubeOptions = {
  privacy?: Privacy;
  publishAt?: Date;
  containsSyntheticMedia?: boolean;
  dryRun?: boolean;
  client?: youtube_v3.Youtube;
  log?: (msg: string) => void;
};

export type PostToYouTubeResult = { metadata: youtube_v3.Schema$Video; upload?: UploadResult };

export async function postToYouTube(run: RenderedRun, opts: PostToYouTubeOptions = {}): Promise<PostToYouTubeResult> {
  const log = opts.log ?? (() => {});
  const metadata = buildYouTubeMetadata({
    title: run.script.title,
    description: run.script.description,
    hashtags: run.script.hashtags,
    privacy: opts.privacy,
    publishAt: opts.publishAt,
    containsSyntheticMedia: opts.containsSyntheticMedia,
    long: run.format === "long",
  });
  if (opts.dryRun) return { metadata };

  const record = dbConfigured() && run.videoId ? run.videoId : undefined;
  if (record) await upsertPost(record, "youtube", { status: "uploading", scheduled_for: opts.publishAt });

  try {
    let lastPct = -1;
    const upload = await uploadToYouTube(run.videoPath, metadata, {
      client: opts.client,
      long: run.format === "long",
      onProgress: (f) => {
        const pct = Math.floor(f * 10) * 10;
        if (pct !== lastPct) log(`Uploading… ${(lastPct = pct)}%`);
      },
    });

    if (record) {
      await upsertPost(record, "youtube", {
        status: upload.publishAt ? "scheduled" : "published",
        external_id: upload.videoId,
        url: upload.url,
        scheduled_for: upload.publishAt ? new Date(upload.publishAt) : undefined,
        published_at: upload.publishAt ? undefined : new Date(),
      });
    }
    const thumb = join(run.dir, "thumbnail.jpg");
    if (run.format === "long" && existsSync(thumb)) {
      // The video is already up; a missing thumbnail shouldn't fail the post.
      await setThumbnail(upload.videoId, thumb, opts.client).then(
        () => log("Thumbnail set."),
        (err) => log(`Thumbnail not set: ${(err as Error).message}`),
      );
    }
    await writeFile(join(run.dir, "youtube.json"), JSON.stringify(upload, null, 2));
    return { metadata, upload };
  } catch (err) {
    if (record) await upsertPost(record, "youtube", { status: "failed", error: (err as Error).message }).catch(() => {});
    throw err;
  }
}
