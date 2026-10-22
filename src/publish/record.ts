import { dbConfigured, upsertPost, type Platform } from "../lib/db.js";
import type { RenderedRun } from "./run-dir.js";

export type PostOutcome = { externalId: string; url?: string; scheduledFor?: string };

// Runs one platform upload and mirrors its progress into the posts table when there is one.
export async function recordPost(run: RenderedRun, platform: Platform, scheduledFor: Date | undefined, upload: () => Promise<PostOutcome>): Promise<PostOutcome> {
  const id = dbConfigured() && run.videoId ? run.videoId : undefined;
  if (id) await upsertPost(id, platform, { status: "uploading", scheduled_for: scheduledFor });
  try {
    const out = await upload();
    if (id) {
      await upsertPost(id, platform, {
        status: out.scheduledFor ? "scheduled" : "published",
        external_id: out.externalId,
        url: out.url,
        scheduled_for: out.scheduledFor ? new Date(out.scheduledFor) : undefined,
        published_at: out.scheduledFor ? undefined : new Date(),
      });
    }
    return out;
  } catch (err) {
    if (id) await upsertPost(id, platform, { status: "failed", error: (err as Error).message }).catch(() => {});
    throw err;
  }
}
