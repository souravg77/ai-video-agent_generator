import { writeFile } from "node:fs/promises";
import { config } from "../config.js";
import { ffmpeg } from "../lib/ffmpeg.js";
import { FRAME, type VideoFormat } from "./captions.js";

type PexelsFile = { link: string; width: number; height: number; file_type: string };
type PexelsVideo = { id: number; duration: number; video_files: PexelsFile[] };

// Picks the smallest MP4 in the right orientation whose short side is at least 1080, else the largest one.
export function pickFile(files: PexelsFile[], format: VideoFormat = "short"): PexelsFile | undefined {
  const fits = files.filter((f) => f.file_type === "video/mp4" && (format === "short" ? f.height > f.width : f.width > f.height));
  const side = (f: PexelsFile) => Math.min(f.width, f.height);
  const bigEnough = fits.filter((f) => side(f) >= 1080).sort((a, b) => side(a) - side(b));
  return bigEnough[0] ?? fits.sort((a, b) => side(b) - side(a))[0];
}

export const pickPortraitFile = (files: PexelsFile[]) => pickFile(files, "short");

const OFFLINE_COLORS = ["0x1f3a5f", "0x3d5a40", "0x5f2a3a", "0x4a3f6b", "0x6b4f2a", "0x2a5f5c"];

// Downloads (or, offline, generates) a background clip for one scene.
export async function fetchVisual(
  query: string,
  outPath: string,
  minSeconds: number,
  opts: { offline?: boolean; sceneIndex?: number; usedIds?: Set<number>; format?: VideoFormat } = {},
): Promise<void> {
  const format = opts.format ?? "short";
  const pick = (files: PexelsFile[]) => pickFile(files, format);
  if (opts.offline) {
    const { width, height } = FRAME[format];
    const color = OFFLINE_COLORS[(opts.sceneIndex ?? 0) % OFFLINE_COLORS.length];
    await ffmpeg(["-f", "lavfi", "-i", `color=c=${color}:s=${width}x${height}:r=30`, "-t", minSeconds.toFixed(2), "-pix_fmt", "yuv420p", outPath]);
    return;
  }
  if (!config.PEXELS_API_KEY) throw new Error("PEXELS_API_KEY is not set. Add it to .env or run with --offline.");

  const url = new URL("https://api.pexels.com/videos/search");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", format === "short" ? "portrait" : "landscape");
  url.searchParams.set("per_page", "15");
  const res = await fetch(url, { headers: { Authorization: config.PEXELS_API_KEY } });
  if (!res.ok) throw new Error(`Pexels search failed (${res.status}) for "${query}"`);
  const { videos } = (await res.json()) as { videos: PexelsVideo[] };

  // Prefer clips long enough for the scene and not already used in this video.
  const used = opts.usedIds ?? new Set<number>();
  const ranked = [...videos].sort((a, b) => Number(b.duration >= minSeconds) - Number(a.duration >= minSeconds));
  const choice = ranked.find((v) => !used.has(v.id) && pick(v.video_files)) ?? ranked.find((v) => pick(v.video_files));
  if (!choice) throw new Error(`No ${format === "short" ? "portrait" : "landscape"} stock footage found for "${query}". Try a more concrete visual_query.`);
  used.add(choice.id);

  const file = pick(choice.video_files)!;
  const download = await fetch(file.link);
  if (!download.ok) throw new Error(`Downloading Pexels video ${choice.id} failed (${download.status})`);
  await writeFile(outPath, Buffer.from(await download.arrayBuffer()));
}
