import { writeFile } from "node:fs/promises";
import { config } from "../config.js";
import { ffmpeg } from "../lib/ffmpeg.js";

type PexelsFile = { link: string; width: number; height: number; file_type: string };
type PexelsVideo = { id: number; duration: number; video_files: PexelsFile[] };

// Picks the smallest portrait MP4 that is still at least 1080 wide, else the largest portrait one.
export function pickPortraitFile(files: PexelsFile[]): PexelsFile | undefined {
  const portrait = files.filter((f) => f.file_type === "video/mp4" && f.height > f.width);
  const bigEnough = portrait.filter((f) => f.width >= 1080).sort((a, b) => a.width - b.width);
  return bigEnough[0] ?? portrait.sort((a, b) => b.width - a.width)[0];
}

const OFFLINE_COLORS = ["0x1f3a5f", "0x3d5a40", "0x5f2a3a", "0x4a3f6b", "0x6b4f2a", "0x2a5f5c"];

// Downloads (or, offline, generates) a background clip for one scene.
export async function fetchVisual(
  query: string,
  outPath: string,
  minSeconds: number,
  opts: { offline?: boolean; sceneIndex?: number; usedIds?: Set<number> } = {},
): Promise<void> {
  if (opts.offline) {
    const color = OFFLINE_COLORS[(opts.sceneIndex ?? 0) % OFFLINE_COLORS.length];
    await ffmpeg(["-f", "lavfi", "-i", `color=c=${color}:s=1080x1920:r=30`, "-t", minSeconds.toFixed(2), "-pix_fmt", "yuv420p", outPath]);
    return;
  }
  if (!config.PEXELS_API_KEY) throw new Error("PEXELS_API_KEY is not set. Add it to .env or run with --offline.");

  const url = new URL("https://api.pexels.com/videos/search");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "portrait");
  url.searchParams.set("per_page", "15");
  const res = await fetch(url, { headers: { Authorization: config.PEXELS_API_KEY } });
  if (!res.ok) throw new Error(`Pexels search failed (${res.status}) for "${query}"`);
  const { videos } = (await res.json()) as { videos: PexelsVideo[] };

  // Prefer clips long enough for the scene and not already used in this video.
  const used = opts.usedIds ?? new Set<number>();
  const ranked = [...videos].sort((a, b) => Number(b.duration >= minSeconds) - Number(a.duration >= minSeconds));
  const choice = ranked.find((v) => !used.has(v.id) && pickPortraitFile(v.video_files)) ?? ranked.find((v) => pickPortraitFile(v.video_files));
  if (!choice) throw new Error(`No portrait stock footage found for "${query}". Try a more concrete visual_query.`);
  used.add(choice.id);

  const file = pickPortraitFile(choice.video_files)!;
  const download = await fetch(file.link);
  if (!download.ok) throw new Error(`Downloading Pexels video ${choice.id} failed (${download.status})`);
  await writeFile(outPath, Buffer.from(await download.arrayBuffer()));
}
