import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildCaption, postFacebookReel, type PollOptions } from "../lib/meta.js";
import { recordPost, type PostOutcome } from "./record.js";
import type { RenderedRun } from "./run-dir.js";

export async function postToFacebook(run: RenderedRun, opts: { scheduleAt?: Date; poll?: PollOptions } = {}): Promise<PostOutcome> {
  const description = buildCaption(run.script.description, run.script.hashtags, 5000);
  const out = await recordPost(run, "facebook", opts.scheduleAt, async () => {
    const r = await postFacebookReel(run.videoPath, description, opts);
    return { externalId: r.videoId, url: r.url, scheduledFor: r.scheduledFor };
  });
  await writeFile(join(run.dir, "facebook.json"), JSON.stringify(out, null, 2));
  return out;
}
