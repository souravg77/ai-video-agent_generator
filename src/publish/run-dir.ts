import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";
import { normalizeScript, type VideoScript } from "../pipeline/script.js";

import type { VideoFormat } from "../pipeline/captions.js";

export type RenderedRun = { dir: string; videoPath: string; script: VideoScript; videoId?: string; url?: string; format?: VideoFormat };

// Loads a folder written by `npm run make`. With no dir, picks the newest folder under outRoot.
export async function loadRun(dir?: string, outRoot = config.OUT_DIR): Promise<RenderedRun> {
  if (!dir) {
    if (!existsSync(outRoot)) throw new Error(`No ${outRoot}/ folder yet. Make a video first with \`npm run make\`.`);
    const runs = (await readdir(outRoot, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    // Folder names start with an ISO timestamp, so the last one is the newest.
    const latest = runs.filter((r) => existsSync(join(outRoot, r, "video.mp4"))).at(-1);
    if (!latest) throw new Error(`No finished video found under ${outRoot}/.`);
    dir = join(outRoot, latest);
  }

  const videoPath = join(dir, "video.mp4");
  if (!existsSync(videoPath)) throw new Error(`${videoPath} not found.`);
  const script = normalizeScript(JSON.parse(await readFile(join(dir, "script.json"), "utf8")) as VideoScript);
  const resultPath = join(dir, "result.json");
  const result = existsSync(resultPath) ? (JSON.parse(await readFile(resultPath, "utf8")) as { videoId?: string; url?: string; format?: VideoFormat }) : {};
  return { dir, videoPath, script, videoId: result.videoId, url: result.url, format: result.format ?? "short" };
}
