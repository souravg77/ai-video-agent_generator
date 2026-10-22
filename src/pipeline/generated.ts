import { writeFile } from "node:fs/promises";
import { config } from "../config.js";
import type { VideoFormat } from "./captions.js";

// Generated video clips through fal.ai's queue API (any of its text-to-video models: Kling, Veo, Luma…).
// Used only for the opening scene when GENERATED_CLIPS=hook, since generated video costs per second.

export const fal = { fetch: (input: string, init?: RequestInit) => fetch(input, init), pollMs: 5000, timeoutMs: 10 * 60_000 };

export const generatedClipsEnabled = () => config.GENERATED_CLIPS === "hook" && Boolean(config.FAL_KEY);

export function clipPrompt(visualQuery: string, narration: string): string {
  return `Cinematic, realistic footage: ${visualQuery}. The scene illustrates: "${narration}". Smooth camera motion, natural light, no text, no captions, no logos, no watermarks.`;
}

// Returns the cost in USD.
export async function generateClip(prompt: string, outPath: string, format: VideoFormat): Promise<number> {
  if (!config.FAL_KEY) throw new Error("FAL_KEY is not set.");
  const headers = { authorization: `Key ${config.FAL_KEY}`, "content-type": "application/json" };
  const input = {
    prompt,
    aspect_ratio: format === "long" ? "16:9" : "9:16",
    duration: String(config.GENERATED_CLIP_SECONDS),
    ...(config.FAL_EXTRA_INPUT ? (JSON.parse(config.FAL_EXTRA_INPUT) as Record<string, unknown>) : {}),
  };
  const submit = await fal.fetch(`https://queue.fal.run/${config.FAL_VIDEO_MODEL}`, { method: "POST", headers, body: JSON.stringify(input) });
  if (!submit.ok) throw new Error(`fal.ai rejected the request (${submit.status}): ${await submit.text()}`);
  const job = (await submit.json()) as { status_url: string; response_url: string };

  const deadline = Date.now() + fal.timeoutMs;
  for (;;) {
    const status = (await (await fal.fetch(job.status_url, { headers })).json()) as { status: string };
    if (status.status === "COMPLETED") break;
    if (status.status === "FAILED" || status.status === "ERROR") throw new Error("fal.ai could not generate the clip.");
    if (Date.now() > deadline) throw new Error("fal.ai took more than 10 minutes to generate the clip.");
    await new Promise((r) => setTimeout(r, fal.pollMs));
  }
  const result = (await (await fal.fetch(job.response_url, { headers })).json()) as { video?: { url?: string } };
  if (!result.video?.url) throw new Error("fal.ai finished but returned no video URL.");
  const download = await fal.fetch(result.video.url);
  if (!download.ok) throw new Error(`Downloading the generated clip failed (${download.status}).`);
  await writeFile(outPath, Buffer.from(await download.arrayBuffer()));
  return config.GENERATED_CLIP_SECONDS * config.GENERATED_CLIP_USD_PER_SECOND;
}
