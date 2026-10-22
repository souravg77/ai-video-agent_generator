import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dbConfigured, upsertPost, type Platform } from "../lib/db.js";
import { buildCaption } from "../lib/meta.js";
import { buildYouTubeMetadata } from "../lib/youtube.js";
import type { VideoScript } from "../pipeline/script.js";
import type { PlatformResult } from "./index.js";
import type { RenderedRun } from "./run-dir.js";

const PLATFORM_NAME: Record<Platform, string> = { youtube: "YouTube", facebook: "Facebook", instagram: "Instagram" };

// The text to paste into each platform's upload form, built the same way the API publishers build it.
export function uploadText(platform: Platform, script: Pick<VideoScript, "title" | "description" | "hashtags">, long = false): { title?: string; caption: string } {
  if (platform === "youtube") {
    const { snippet } = buildYouTubeMetadata({ title: script.title, description: script.description, hashtags: script.hashtags, long });
    return { title: snippet!.title!, caption: snippet!.description! };
  }
  return { caption: buildCaption(script.description, script.hashtags, platform === "facebook" ? 5000 : 2200) };
}

export function slugify(s: string): string {
  const plain = s.normalize("NFKD").replace(/(\p{Script=Latin})\p{M}+/gu, "$1").normalize("NFC").toLowerCase(); // é → e, but ジ stays ジ
  return plain.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 50) || "video";
}

// PUBLISH_MODE=manual: instead of calling YouTube or Meta, puts the video and its text in one folder
// (<outRoot>/ready/<date>-<title>/) for you to upload by hand, and marks those posts as exported.
export async function exportForUpload(run: RenderedRun, platforms: Platform[], outRoot: string, now = new Date()): Promise<{ dir: string; results: PlatformResult[] }> {
  const long = run.format === "long";
  const dir = join(outRoot, "ready", `${now.toISOString().slice(0, 10)}-${slugify(run.script.title)}`);
  await mkdir(dir, { recursive: true });
  await copyFile(run.videoPath, join(dir, "video.mp4"));
  const thumb = join(run.dir, "thumbnail.jpg");
  if (existsSync(thumb)) await copyFile(thumb, join(dir, "thumbnail.jpg"));

  const results: PlatformResult[] = [];
  const steps: string[] = [];
  for (const platform of platforms) {
    if (long && platform !== "youtube") {
      results.push({ platform, ok: false, error: `${platform} Reels must be vertical, so long 16:9 videos only go to YouTube.` });
      continue;
    }
    const text = uploadText(platform, run.script, long);
    const body = text.title ? `TITLE\n${text.title}\n\nDESCRIPTION\n${text.caption}\n` : `${text.caption}\n`;
    await writeFile(join(dir, `${platform}.txt`), body);
    steps.push(`- ${PLATFORM_NAME[platform]}: upload video.mp4${long && existsSync(thumb) ? " (and thumbnail.jpg)" : ""} and paste ${platform}.txt${platform === "youtube" ? " (title, then description)" : " as the caption"}.`);
    if (dbConfigured() && run.videoId) await upsertPost(run.videoId, platform, { status: "exported", published_at: now });
    results.push({ platform, ok: true, outcome: { externalId: "" } });
  }
  await writeFile(
    join(dir, "UPLOAD.md"),
    `# ${run.script.title}\n\nReady to upload by hand. The agent doesn't post in manual mode and can't read stats or comments for these posts.\n\n${steps.join("\n")}\n`,
  );
  return { dir, results };
}
