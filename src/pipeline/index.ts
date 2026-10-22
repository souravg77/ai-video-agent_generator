import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";
import { createVideo, dbConfigured, updateVideo } from "../lib/db.js";
import { probeDuration } from "../lib/ffmpeg.js";
import { storageConfigured, uploadFile, videoKey } from "../lib/storage.js";
import { buildAss, timeScenes, type VideoFormat } from "./captions.js";
import type { HookStyle } from "./hooks.js";
import { clipPrompt, generateClip, generatedClipsEnabled } from "./generated.js";
import { renderVideo } from "./render.js";
import { makeThumbnail } from "./thumbnail.js";
import { generateScript, normalizeScript, sampleScript, translateScript, type VideoScript } from "./script.js";
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
  format?: VideoFormat; // default VIDEO_FORMAT
  language?: string; // default VIDEO_LANGUAGE
  hookStyle?: HookStyle;
  // A finished run folder to translate into `language`, reusing its footage.
  translateFrom?: string;
  log?: (msg: string) => void;
};

export type MakeVideoResult = {
  dir: string;
  videoPath: string;
  script: VideoScript;
  durationSec: number;
  costUsd: number;
  format: VideoFormat;
  language: string;
  videoId?: string;
  url?: string;
};

// Pause after each scene's narration so cuts don't feel rushed.
const SCENE_PADDING_SEC = 0.35;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "video";

async function readSource(dir: string): Promise<{ script: VideoScript; format: VideoFormat }> {
  if (!existsSync(join(dir, "script.json"))) throw new Error(`${dir} has no script.json to translate.`);
  const script = normalizeScript(JSON.parse(await readFile(join(dir, "script.json"), "utf8")));
  const result = existsSync(join(dir, "result.json")) ? JSON.parse(await readFile(join(dir, "result.json"), "utf8")) : {};
  return { script, format: result.format ?? "short" };
}

export async function makeVideo(opts: MakeVideoOptions): Promise<MakeVideoResult> {
  const log = opts.log ?? (() => {});
  const source = opts.translateFrom ? await readSource(opts.translateFrom) : undefined;
  const format = source?.format ?? opts.format ?? config.VIDEO_FORMAT;
  const language = opts.language ?? config.VIDEO_LANGUAGE;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = join(opts.outDir ?? config.OUT_DIR, `${stamp}-${slug(opts.topic)}${source ? `-${slug(language)}` : ""}`);
  await mkdir(dir, { recursive: true });

  const videoId = opts.videoId ?? (!opts.offline && dbConfigured() ? await createVideo(opts.topic) : undefined);

  try {
    let costUsd = 0;
    let script: VideoScript;
    if (source) {
      log(`Translating "${source.script.title}" into ${language}…`);
      if (opts.offline) script = { ...source.script, title: `[${language}] ${source.script.title}` };
      else ({ script, costUsd } = await translateScript(source.script, language));
    } else {
      log("Writing script…");
      if (opts.offline) script = sampleScript(opts.topic);
      else ({ script, costUsd } = await generateScript(opts.topic, opts.angle, { format, language, hookStyle: opts.hookStyle }));
    }
    await writeFile(join(dir, "script.json"), JSON.stringify(script, null, 2));
    if (videoId) {
      await updateVideo(videoId, { status: "rendering", script, title: script.title, description: script.description, hashtags: script.hashtags, format, language, hook_style: source ? undefined : opts.hookStyle });
    }

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
    const usedFiles = new Set<string>();
    for (const [i, scene] of script.scenes.entries()) {
      const visual = join(dir, `visual-${i}.mp4`);
      const reuse = opts.translateFrom && join(opts.translateFrom, `visual-${i}.mp4`);
      if (reuse && existsSync(reuse)) await copyFile(reuse, visual);
      else if (i === 0 && !opts.offline && generatedClipsEnabled()) {
        log("Generating the opening clip…");
        try {
          costUsd += await generateClip(clipPrompt(scene.visual_query, scene.narration), visual, format);
        } catch (err) {
          log(`Generated clip failed (${(err as Error).message}); using stock footage instead.`);
          await fetchVisual(scene.visual_query, visual, durations[i], { offline: opts.offline, sceneIndex: i, usedIds, usedFiles, format });
        }
      } else await fetchVisual(scene.visual_query, visual, durations[i], { offline: opts.offline, sceneIndex: i, usedIds, usedFiles, format });
      visuals.push(visual);
    }

    log("Rendering…");
    const assPath = join(dir, "captions.ass");
    await writeFile(assPath, buildAss(timeScenes(script.scenes, durations), { format, font: config.CAPTION_FONT }));
    const videoPath = join(dir, "video.mp4");
    await renderVideo({ visuals, voices, durations, assPath, outPath: videoPath, musicPath: opts.musicPath, format });
    const durationSec = await probeDuration(videoPath);

    if (format === "long") {
      log("Making thumbnail…");
      const text = script.scenes[0].on_screen_text || script.title.split(/\s+/).slice(0, 5).join(" ");
      await makeThumbnail({ visualPath: visuals[0], text, assPath: join(dir, "thumbnail.ass"), outPath: join(dir, "thumbnail.jpg"), font: config.CAPTION_FONT });
    }

    let url: string | undefined;
    let storageKey: string | undefined;
    if (opts.upload !== false && !opts.offline && storageConfigured()) {
      log("Uploading to storage…");
      storageKey = videoKey(videoId ?? stamp);
      url = await uploadFile(videoPath, storageKey, "video/mp4");
    }

    if (videoId) await updateVideo(videoId, { status: "rendered", storage_key: storageKey, duration_sec: durationSec, local_dir: dir, public_url: url, error: null, cost_usd: costUsd });
    await writeFile(join(dir, "result.json"), JSON.stringify({ videoId, videoPath, durationSec, url, costUsd, format, language }, null, 2));
    return { dir, videoPath, script, durationSec, videoId, url, costUsd, format, language };
  } catch (err) {
    if (videoId) await updateVideo(videoId, { status: "failed", error: (err as Error).message }).catch(() => {});
    throw err;
  }
}
