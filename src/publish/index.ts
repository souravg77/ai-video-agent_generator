import type { Platform } from "../lib/db.js";
import type { Privacy } from "../lib/youtube.js";
import { postToFacebook } from "./facebook.js";
import { postToInstagram } from "./instagram.js";
import type { PostOutcome } from "./record.js";
import type { RenderedRun } from "./run-dir.js";
import { postToYouTube } from "./youtube.js";

export const PLATFORMS: Platform[] = ["youtube", "facebook", "instagram"];

export function parsePlatforms(list: string): Platform[] {
  const names = list.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const bad = names.filter((n) => !PLATFORMS.includes(n as Platform));
  if (bad.length) throw new Error(`Unknown platform: ${bad.join(", ")}. Use youtube, facebook, instagram.`);
  return [...new Set(names)] as Platform[];
}

export type PublishOptions = {
  privacy?: Privacy;
  scheduleAt?: Date;
  containsSyntheticMedia?: boolean;
  log?: (msg: string) => void;
};

export type PlatformResult = { platform: Platform; ok: true; outcome: PostOutcome } | { platform: Platform; ok: false; error: string };

// Posts to each platform in turn; one platform failing doesn't stop the others.
export async function publish(run: RenderedRun, platforms: Platform[], opts: PublishOptions = {}): Promise<PlatformResult[]> {
  const log = opts.log ?? (() => {});
  if (opts.scheduleAt && platforms.includes("instagram")) {
    throw new Error("Instagram's API can't schedule posts. Post Instagram at the scheduled time instead (the agent in phase 4 does this).");
  }
  const results: PlatformResult[] = [];
  for (const platform of platforms) {
    if (run.format === "long" && platform !== "youtube") {
      results.push({ platform, ok: false, error: `${platform} Reels must be vertical, so long 16:9 videos only go to YouTube.` });
      continue;
    }
    log(`Posting to ${platform}…`);
    try {
      let outcome: PostOutcome;
      if (platform === "youtube") {
        const { upload } = await postToYouTube(run, { privacy: opts.privacy, publishAt: opts.scheduleAt, containsSyntheticMedia: opts.containsSyntheticMedia, log });
        outcome = { externalId: upload!.videoId, url: upload!.url, scheduledFor: upload!.publishAt };
      } else if (platform === "facebook") {
        outcome = await postToFacebook(run, { scheduleAt: opts.scheduleAt });
      } else {
        outcome = await postToInstagram(run);
      }
      results.push({ platform, ok: true, outcome });
    } catch (err) {
      results.push({ platform, ok: false, error: (err as Error).message });
    }
  }
  return results;
}
