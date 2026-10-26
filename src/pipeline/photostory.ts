import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { basename, join } from "node:path";
import { config } from "../config.js";
import { ffmpeg, probeDuration } from "../lib/ffmpeg.js";
import { FRAME, type VideoFormat } from "./captions.js";

// Builds a video from the user's own photos and their own voice-over — no LLM,
// no TTS. The photos become a gentle zoom/pan slideshow timed to the audio.
// If AVATAR_CMD is set, it instead hands the first photo + the audio to that
// program (e.g. a local Wav2Lip/SadTalker wrapper) to make a talking-head video.

export type PhotoVideoOptions = {
  images: string[]; // 1-4 image file paths
  audioPath: string; // the voice-over
  outDir: string; // folder to write video.mp4 and result.json into
  title?: string;
  format?: VideoFormat; // default VIDEO_FORMAT
  log?: (m: string) => void;
};

export type PhotoVideoResult = { dir: string; videoPath: string; durationSec: number };

// Runs an arbitrary program: AVATAR_CMD <photo> <audio> <out>. Experimental.
function runCommand(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"], shell: false });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => reject(new Error(`Could not start AVATAR_CMD (${bin}): ${e.message}`)));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`AVATAR_CMD exited ${code}: ${err.split("\n").slice(-5).join("\n")}`))));
  });
}

export async function makePhotoVideo(opts: PhotoVideoOptions): Promise<PhotoVideoResult> {
  const log = opts.log ?? (() => {});
  const format = opts.format ?? config.VIDEO_FORMAT;
  const { width: W, height: H } = FRAME[format];
  const dir = opts.outDir;
  await mkdir(dir, { recursive: true });
  const videoPath = join(dir, "video.mp4");

  if (!existsSync(opts.audioPath)) throw new Error("The voice-over audio is missing.");
  const images = opts.images.filter((p) => existsSync(p));
  if (!images.length) throw new Error("At least one photo is required.");

  const total = Math.max(1, await probeDuration(opts.audioPath));
  const title = opts.title?.trim() || "Photo video";

  // Experimental talking-avatar path.
  if (config.AVATAR_CMD) {
    log("Generating a talking avatar with AVATAR_CMD (experimental)…");
    await runCommand(config.AVATAR_CMD, [images[0], opts.audioPath, videoPath]);
    if (!existsSync(videoPath)) throw new Error("AVATAR_CMD finished but produced no video.");
    const d = await probeDuration(videoPath);
    await writeFile(join(dir, "script.json"), JSON.stringify({ title }, null, 2));
    await writeFile(join(dir, "result.json"), JSON.stringify({ videoPath, durationSec: d, mode: "avatar" }, null, 2));
    return { dir, videoPath, durationSec: d };
  }

  // Slideshow: one zoom/pan clip per photo, together filling the audio length.
  log(`Building a slideshow from ${images.length} photo(s)…`);
  const per = total / images.length;
  const clips: string[] = [];
  for (const [i, img] of images.entries()) {
    const d = i === images.length - 1 ? total - per * (images.length - 1) : per;
    const frames = Math.max(1, Math.round(d * 30));
    const rate = (0.2 / frames).toFixed(6); // zoom from 1.0 to ~1.2 over the clip
    const clip = join(dir, `clip-${i}.mp4`);
    // -framerate 30 feeds 30 frames/sec; zoompan d=1 makes one output frame per
    // input frame, animating the zoom by output-frame index (on).
    await ffmpeg([
      "-loop", "1", "-framerate", "30", "-t", d.toFixed(3), "-i", img,
      "-vf",
      `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},` +
        `zoompan=z='min(1+${rate}*on,1.2)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=30,` +
        `setsar=1,format=yuv420p`,
      "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-an", clip,
    ]);
    clips.push(clip);
  }

  // clips.txt lives alongside the clips, so list bare file names: the concat
  // demuxer resolves each entry relative to the list file's own directory, and a
  // relative outDir (the default) would otherwise get doubled into the path.
  const listPath = join(dir, "clips.txt");
  await writeFile(listPath, clips.map((c) => `file '${basename(c).replace(/'/g, "'\\''")}'`).join("\n"));
  const concat = join(dir, "concat.mp4");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", concat]);

  log("Adding your voice-over…");
  await ffmpeg([
    "-i", concat, "-i", opts.audioPath,
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", videoPath,
  ]);

  for (const c of clips) await rm(c, { force: true });
  await rm(concat, { force: true });
  await rm(listPath, { force: true });

  const durationSec = await probeDuration(videoPath);
  await writeFile(join(dir, "script.json"), JSON.stringify({ title }, null, 2));
  await writeFile(join(dir, "result.json"), JSON.stringify({ videoPath, durationSec, mode: "photos", title }, null, 2));
  return { dir, videoPath, durationSec };
}
