import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createVideo, dbConfigured, updateVideo } from "../lib/db.js";
import { probeDuration } from "../lib/ffmpeg.js";
import { storageConfigured, uploadFile } from "../lib/storage.js";
import { buildAss, timeScenes } from "./captions.js";
import { renderVideo } from "./render.js";
import { generateScript, sampleScript, type VideoScript } from "./script.js";
import { fetchVisual } from "./visuals.js";
import { synthesizeVoice } from "./voice.js";

export type MakeVideoOptions = {
  topic: string;
  angle?: string;
  // An existing videos row to fill in (used by the agent); otherwise a new row is created when a database is set up.
  videoId?: string;
  outDir?: string;
  offline?: boolean;
  musicPath?: string;
  upload?: boolean;
  log?: (msg: string) => void;
};

export type MakeVideoResult = {
  dir: string;
  videoPath: string;
  script: VideoScript;
  durationSec: number;
  costUsd: number;
  videoId?: string;
  url?: string;
};

// Pause after each scene's narration so cuts don't feel rushed.
const SCENE_PADDING_SEC = 0.35;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "video";

export async function makeVideo(opts: MakeVideoOptions): Promise<MakeVideoResult> {
  const log = opts.log ?? (() => {});
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = join(opts.outDir ?? "out", `${stamp}-${slug(opts.topic)}`);
  await mkdir(dir, { recursive: true });

  const videoId = opts.videoId ?? (!opts.offline && dbConfigured() ? await createVideo(opts.topic) : undefined);

  try {
    log("Writing script…");
    let costUsd = 0;
    let script: VideoScript;
    if (opts.offline) script = sampleScript(opts.topic);
    else ({ script, costUsd } = await generateScript(opts.topic, opts.angle));
    await writeFile(join(dir, "script.json"), JSON.stringify(script, null, 2));
    if (videoId) await updateVideo(videoId, { status: "rendering", script, title: script.title, description: script.description, hashtags: script.hashtags });

    log(`Recording voice-over for ${script.scenes.length} scenes…`);
    const voices: string[] = [];
    const durations: number[] = [];
    for (const [i, scene] of script.scenes.entries()) {
      const voice = join(dir, `voice-${i}.mp3`);
      costUsd += await synthesizeVoice(scene.narration, voice, { offline: opts.offline });
      voices.push(voice);
      durations.push((await probeDuration(voice)) + SCENE_PADDING_SEC);
    }

    log("Fetching visuals…");
    const visuals: string[] = [];
    const usedIds = new Set<number>();
    for (const [i, scene] of script.scenes.entries()) {
      const visual = join(dir, `visual-${i}.mp4`);
      await fetchVisual(scene.visual_query, visual, durations[i], { offline: opts.offline, sceneIndex: i, usedIds });
      visuals.push(visual);
    }

    log("Rendering…");
    const assPath = join(dir, "captions.ass");
    await writeFile(assPath, buildAss(timeScenes(script.scenes, durations)));
    const videoPath = join(dir, "video.mp4");
    await renderVideo({ visuals, voices, durations, assPath, outPath: videoPath, musicPath: opts.musicPath });
    const durationSec = await probeDuration(videoPath);

    let url: string | undefined;
    let storageKey: string | undefined;
    if (opts.upload !== false && !opts.offline && storageConfigured()) {
      log("Uploading to storage…");
      storageKey = `videos/${videoId ?? stamp}.mp4`;
      url = await uploadFile(videoPath, storageKey, "video/mp4");
    }

    if (videoId) await updateVideo(videoId, { status: "rendered", storage_key: storageKey, duration_sec: durationSec, local_dir: dir, public_url: url, error: null, cost_usd: costUsd });
    await writeFile(join(dir, "result.json"), JSON.stringify({ videoId, videoPath, durationSec, url, costUsd }, null, 2));
    return { dir, videoPath, script, durationSec, videoId, url, costUsd };
  } catch (err) {
    if (videoId) await updateVideo(videoId, { status: "failed", error: (err as Error).message }).catch(() => {});
    throw err;
  }
}
