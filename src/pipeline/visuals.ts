import { existsSync } from "node:fs";
import { copyFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
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

const PALETTES = [
  ["0x1f3a5f", "0x6b2a5f", "0x2a5f5c"],
  ["0x3d5a40", "0x1f3a5f", "0x8a6d1f"],
  ["0x5f2a3a", "0x2a3f6b", "0x6b4f2a"],
  ["0x4a3f6b", "0x1f5f4a", "0x6b2a3a"],
  ["0x2a5f5c", "0x5f4a1f", "0x3a2a6b"],
];

// Slowly moving colour gradients: no download, no API, looks intentional behind big captions.
export async function generatedBackground(outPath: string, seconds: number, format: VideoFormat, sceneIndex: number): Promise<void> {
  const { width, height } = FRAME[format];
  const [c0, c1, c2] = PALETTES[sceneIndex % PALETTES.length];
  await ffmpeg([
    "-f", "lavfi",
    "-i", `gradients=s=${width}x${height}:c0=${c0}:c1=${c1}:c2=${c2}:nb_colors=3:speed=0.015:rate=30:seed=${sceneIndex + 1}:duration=${seconds.toFixed(2)}`,
    "-pix_fmt", "yuv420p",
    outPath,
  ]);
}

// Animates a still image into a `seconds`-long clip with a slow Ken Burns zoom/pan.
// Alternates zoom-in and zoom-out by scene so consecutive scenes don't feel identical.
async function kenBurnsClip(imgPath: string, outPath: string, seconds: number, format: VideoFormat, sceneIndex: number): Promise<void> {
  const { width: W, height: H } = FRAME[format];
  const frames = Math.max(1, Math.round(seconds * 30));
  const rate = (0.2 / frames).toFixed(6); // zoom across ~1.0–1.2 over the clip
  const z = sceneIndex % 2 === 0 ? `min(1+${rate}*on,1.2)` : `max(1.2-${rate}*on,1.0)`;
  await ffmpeg([
    "-loop", "1", "-framerate", "30", "-t", seconds.toFixed(3), "-i", imgPath,
    "-vf",
    `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},` +
      `zoompan=z='${z}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=30,` +
      `setsar=1,format=yuv420p`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-an", outPath,
  ]);
}

// Overridable so tests can stand in for the image server.
export const imageApi = { fetch: (input: string, init?: RequestInit) => fetch(input, init) };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The built-in ComfyUI workflow (API format): a FLUX-schnell checkpoint, 4 steps. Placeholders
// are substituted per scene. Override it with IMAGE_WORKFLOW for a different model/pipeline.
function defaultComfyWorkflow(): string {
  return JSON.stringify({
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "__MODEL__" } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: "__PROMPT__", clip: ["1", 1] } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["1", 1] } },
    "4": { class_type: "EmptySD3LatentImage", inputs: { width: "__WIDTH__", height: "__HEIGHT__", batch_size: 1 } },
    "5": { class_type: "KSampler", inputs: { seed: "__SEED__", steps: 4, cfg: 1, sampler_name: "euler", scheduler: "simple", denoise: 1, model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0] } },
    "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    "7": { class_type: "SaveImage", inputs: { filename_prefix: "sgain", images: ["6", 0] } },
  });
}

// Fills the workflow placeholders. WIDTH/HEIGHT/SEED are numbers, so they're substituted
// unquoted ("width": "__WIDTH__" -> "width": 768); PROMPT/MODEL are quoted strings.
function fillWorkflow(tpl: string, prompt: string, w: number, h: number, seed: number, model: string): unknown {
  const json = tpl
    .replace(/"__WIDTH__"/g, String(w))
    .replace(/"__HEIGHT__"/g, String(h))
    .replace(/"__SEED__"/g, String(seed))
    .replace(/__PROMPT__/g, prompt.replace(/\\/g, "\\\\").replace(/"/g, '\\"'))
    .replace(/__MODEL__/g, model.replace(/\\/g, "\\\\").replace(/"/g, '\\"'));
  return JSON.parse(json);
}

// Generates one image via ComfyUI's native API: queue a prompt, poll its history, fetch the
// saved image. Needs only ComfyUI running with a FLUX (or SDXL) model — no shim.
async function imageViaComfy(prompt: string, w: number, h: number, seed: number): Promise<Buffer> {
  const base = config.IMAGE_BASE_URL.replace(/\/+$/, "").replace(/\/v1$/, "");
  const workflow = fillWorkflow(config.IMAGE_WORKFLOW || defaultComfyWorkflow(), prompt, w, h, seed, config.IMAGE_MODEL);
  let queued: Response;
  try {
    queued = await imageApi.fetch(`${base}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: "sgain-studio" }),
    });
  } catch (err) {
    throw new Error(`Can't reach ComfyUI at ${base} (${(err as Error).message}). Is it running, and is IMAGE_BASE_URL right? See docs/local-footage.md.`);
  }
  if (!queued.ok) throw new Error(`ComfyUI rejected the request (${queued.status}): ${(await queued.text()).slice(0, 300)}. Check IMAGE_MODEL matches a checkpoint ComfyUI has.`);
  const { prompt_id: promptId } = (await queued.json()) as { prompt_id?: string };
  if (!promptId) throw new Error("ComfyUI didn't return a prompt id.");

  // Poll the history until this prompt has outputs (image generation on a GPU is seconds to tens of seconds).
  const deadline = Date.now() + 180_000;
  let outputs: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }> | undefined;
  while (Date.now() < deadline) {
    await sleep(1500);
    const hr = await imageApi.fetch(`${base}/history/${promptId}`);
    if (!hr.ok) continue;
    const hist = (await hr.json()) as Record<string, { outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }> }>;
    const entry = hist[promptId];
    if (entry?.outputs) {
      outputs = entry.outputs;
      break;
    }
  }
  if (!outputs) throw new Error(`ComfyUI didn't finish the image in time for "${prompt.slice(0, 40)}…". A first FLUX run can be slow; try again once the model is loaded.`);

  const img = Object.values(outputs).flatMap((o) => o.images ?? [])[0];
  if (!img) throw new Error("ComfyUI finished but produced no image — check the workflow has a SaveImage node.");
  const view = new URL(`${base}/view`);
  view.searchParams.set("filename", img.filename);
  view.searchParams.set("subfolder", img.subfolder ?? "");
  view.searchParams.set("type", img.type ?? "output");
  const dl = await imageApi.fetch(view.toString());
  if (!dl.ok) throw new Error(`Couldn't fetch the generated image from ComfyUI (${dl.status}).`);
  return Buffer.from(await dl.arrayBuffer());
}

// Generates one image via an OpenAI-style /v1/images/generations server (LocalAI, SwarmUI, …).
async function imageViaOpenai(prompt: string, size: string): Promise<Buffer> {
  const base = config.IMAGE_BASE_URL.replace(/\/$/, "");
  let res: Response;
  try {
    res = await imageApi.fetch(`${base}/images/generations`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(config.IMAGE_API_KEY ? { authorization: `Bearer ${config.IMAGE_API_KEY}` } : {}) },
      body: JSON.stringify({ model: config.IMAGE_MODEL, prompt, n: 1, size, response_format: "b64_json" }),
    });
  } catch (err) {
    throw new Error(`Can't reach the image server at ${base} (${(err as Error).message}). Is it running, and is IMAGE_BASE_URL right? See docs/local-footage.md.`);
  }
  if (!res.ok) throw new Error(`The image server returned ${res.status}: ${(await res.text()).slice(0, 300)}. Check IMAGE_MODEL and that it serves /images/generations.`);
  const data = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
  const first = data.data?.[0];
  if (!first) throw new Error(`The image server returned no image for "${prompt.slice(0, 40)}…".`);
  if (first.b64_json) return Buffer.from(first.b64_json, "base64");
  if (first.url) {
    const dl = await imageApi.fetch(first.url);
    if (!dl.ok) throw new Error(`Downloading the generated image failed (${dl.status}).`);
    return Buffer.from(await dl.arrayBuffer());
  }
  throw new Error("The image server returned neither image data nor a URL.");
}

// Generates a still for one scene from a local image model (FLUX/SDXL on your own GPU) and
// animates it into a clip. Talks to ComfyUI natively, or any OpenAI image server. No cost.
export async function generateLocalVisual(query: string, outPath: string, seconds: number, format: VideoFormat, sceneIndex: number): Promise<void> {
  const size = config.IMAGE_SIZE || (format === "short" ? "832x1216" : "1216x832");
  const [w, h] = size.split("x").map((n) => parseInt(n, 10) || 0);
  if (!w || !h) throw new Error(`IMAGE_SIZE "${size}" isn't a WIDTHxHEIGHT like 832x1216.`);
  const prompt = `${query}, cinematic photograph, realistic, highly detailed, natural lighting, ${format === "short" ? "vertical" : "horizontal"} composition`;
  const seed = Math.floor(Math.random() * 1e15);
  const buf = config.IMAGE_API === "comfyui" ? await imageViaComfy(prompt, w, h, seed) : await imageViaOpenai(prompt, size);

  const imgPath = outPath.replace(/\.mp4$/i, "") + ".src.png";
  await writeFile(imgPath, buf);
  try {
    await kenBurnsClip(imgPath, outPath, seconds, format, sceneIndex);
  } finally {
    await rm(imgPath, { force: true });
  }
}

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv)$/i;
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));

// Picks the clip in your footage folder whose path shares the most words with the scene's search, e.g.
// "ocean waves sunset" matches footage/nature/ocean-waves-01.mp4. Clips aren't reused within a video while others are left.
export async function pickFromFolder(query: string, dir: string, used: Set<string>): Promise<string> {
  const files = existsSync(dir) ? (await readdir(dir, { recursive: true })).map(String).filter((f) => VIDEO_EXT.test(f)).sort() : [];
  if (!files.length) throw new Error(`No video clips in ${dir}/. Add some (named by what they show, e.g. ocean-waves.mp4) or use VISUALS_PROVIDER=generated.`);
  const want = words(query);
  const score = (f: string) => [...words(f)].filter((w) => want.has(w)).length;
  const ranked = files.map((f) => ({ f, s: score(f) - (used.has(f) ? 100 : 0) })).sort((a, b) => b.s - a.s);
  const best = ranked.filter((r) => r.s === ranked[0].s);
  const choice = best[[...query].reduce((h, c) => h + c.charCodeAt(0), 0) % best.length].f;
  used.add(choice);
  return join(dir, choice);
}

// Downloads (or, offline, generates) a background clip for one scene.
export async function fetchVisual(
  query: string,
  outPath: string,
  minSeconds: number,
  opts: { offline?: boolean; sceneIndex?: number; usedIds?: Set<number>; usedFiles?: Set<string>; format?: VideoFormat } = {},
): Promise<void> {
  const format = opts.format ?? "short";
  const pick = (files: PexelsFile[]) => pickFile(files, format);
  if (opts.offline) {
    const { width, height } = FRAME[format];
    const color = OFFLINE_COLORS[(opts.sceneIndex ?? 0) % OFFLINE_COLORS.length];
    await ffmpeg(["-f", "lavfi", "-i", `color=c=${color}:s=${width}x${height}:r=30`, "-t", minSeconds.toFixed(2), "-pix_fmt", "yuv420p", outPath]);
    return;
  }
  if (config.VISUALS_PROVIDER === "generated") return generatedBackground(outPath, minSeconds, format, opts.sceneIndex ?? 0);
  if (config.VISUALS_PROVIDER === "generated-local") return generateLocalVisual(query, outPath, minSeconds, format, opts.sceneIndex ?? 0);
  if (config.VISUALS_PROVIDER === "folder") {
    const clip = await pickFromFolder(query, config.FOOTAGE_DIR, opts.usedFiles ?? new Set());
    await copyFile(clip, outPath);
    return;
  }
  if (!config.PEXELS_API_KEY) {
    throw new Error("PEXELS_API_KEY is not set (it's free at pexels.com/api). Or use VISUALS_PROVIDER=folder or generated, or run with --offline.");
  }

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
