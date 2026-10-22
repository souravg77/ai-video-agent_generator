import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4"; // the SDK's zodOutputFormat helper needs zod v4 schemas
import { config } from "../config.js";
import { claudeCostUsd } from "../lib/costs.js";
import type { VideoFormat } from "./captions.js";

export const SceneSchema = z.object({
  narration: z.string().describe("What the voice-over says in this scene, one or two short sentences"),
  on_screen_text: z.string().describe("Up to 6 punchy words shown large on screen"),
  visual_query: z.string().describe("2-4 word stock footage search, concrete and filmable, e.g. 'city traffic night'"),
});

export const VideoScriptSchema = z.object({
  hook: z.string().describe("The first spoken line; must grab attention in under 3 seconds"),
  scenes: z.array(SceneSchema).describe("The scenes in order; the first scene's narration starts with the hook"),
  title: z.string().describe("Video title, under 70 characters, no hashtags"),
  description: z.string().describe("2-3 sentence description for YouTube, Facebook and Instagram"),
  hashtags: z.array(z.string()).describe("5 to 8 hashtags without the # sign"),
});

export type Scene = z.infer<typeof SceneSchema>;
export type VideoScript = z.infer<typeof VideoScriptSchema>;

export type ScriptOptions = { format?: VideoFormat; language?: string };

export function scriptSystemPrompt(opts: ScriptOptions = {}): string {
  const language = opts.language ?? "English";
  const shape =
    opts.format === "long"
      ? `You write scripts for faceless horizontal YouTube videos made from stock footage with a voice-over.
Target 4-8 minutes of narration at a natural speaking pace (about 2.5 words per second), in 25 to 50 scenes of 2-4 sentences each.
Open with a hook in the first 15 seconds, then deliver on it with a clear structure and a short recap at the end.
Write a description of 3-5 sentences.`
      : `You write scripts for faceless vertical short videos (YouTube Shorts, Instagram Reels, Facebook Reels).
Target 30-60 seconds of narration at a natural speaking pace (about 2.5 words per second), in 4 to 8 scenes.
Open with a hook that creates curiosity.`;
  const lang =
    language.toLowerCase() === "english"
      ? ""
      : `\nWrite the hook, narration, on_screen_text, title, description and hashtags in ${language}, as a native speaker would. Write every visual_query in English, because the stock footage site is searched in English.`;
  return `${shape}
Keep sentences short and spoken, not written.
Every visual_query must describe footage that plausibly exists on a stock site.
Stay factual; do not invent statistics.${lang}`;
}

export async function generateScript(
  topic: string,
  angle?: string,
  opts: ScriptOptions = {},
  client = new Anthropic(),
): Promise<{ script: VideoScript; costUsd: number }> {
  const kind = opts.format === "long" ? "YouTube video" : "short video";
  const ask = angle ? `Write a ${kind} script about: ${topic}\nAngle: ${angle}` : `Write a ${kind} script about: ${topic}`;
  const response = await client.messages.parse({
    model: config.CLAUDE_MODEL,
    max_tokens: opts.format === "long" ? 32000 : 16000,
    output_config: { effort: "medium", format: zodOutputFormat(VideoScriptSchema) },
    system: scriptSystemPrompt(opts),
    messages: [{ role: "user", content: ask }],
  });
  if (response.stop_reason === "refusal") throw new Error(`Claude declined to write a script for "${topic}".`);
  if (response.stop_reason === "max_tokens") throw new Error("Script generation hit max_tokens before finishing.");
  if (!response.parsed_output) throw new Error("Claude's script did not match the expected format.");
  return { script: normalizeScript(response.parsed_output), costUsd: claudeCostUsd(config.CLAUDE_MODEL, response.usage) };
}

// Rewrites a finished script in another language, keeping the same scenes so the same footage fits.
export async function translateScript(script: VideoScript, language: string, client = new Anthropic()): Promise<{ script: VideoScript; costUsd: number }> {
  const response = await client.messages.parse({
    model: config.CLAUDE_MODEL,
    max_tokens: 32000,
    output_config: { effort: "medium", format: zodOutputFormat(VideoScriptSchema) },
    system: `You adapt video scripts into ${language} for native speakers. Keep exactly the same number and order of scenes and the same meaning.
Translate hook, narration, on_screen_text, title, description and hashtags naturally rather than word for word; use hashtags people search for in ${language}.
Keep each visual_query exactly as given, in English.`,
    messages: [{ role: "user", content: JSON.stringify(script) }],
  });
  if (response.stop_reason === "refusal") throw new Error(`Claude declined to translate "${script.title}".`);
  if (!response.parsed_output) throw new Error("Claude's translation did not match the expected format.");
  const out = normalizeScript(response.parsed_output);
  if (out.scenes.length !== script.scenes.length) throw new Error(`The translation has ${out.scenes.length} scenes instead of ${script.scenes.length}.`);
  return { script: out, costUsd: claudeCostUsd(config.CLAUDE_MODEL, response.usage) };
}

// Cleans model output so later steps can rely on it.
export function normalizeScript(script: VideoScript): VideoScript {
  const scenes = script.scenes.filter((s) => s.narration.trim().length > 0);
  if (scenes.length === 0) throw new Error("Script has no scenes with narration.");
  return {
    ...script,
    title: script.title.trim().slice(0, 100),
    hashtags: [...new Set(script.hashtags.map((h) => h.replace(/^#/, "").replace(/\s+/g, "").trim()).filter(Boolean))],
    scenes: scenes.map((s) => ({ ...s, narration: s.narration.trim(), on_screen_text: s.on_screen_text.trim() })),
  };
}

// Used by --offline so the pipeline can be tested without any API keys.
export function sampleScript(topic: string): VideoScript {
  return {
    hook: `Here is something you probably didn't know about ${topic}.`,
    title: `${topic}: the 30 second version`,
    description: `A quick look at ${topic}. Sample script generated offline for testing the pipeline.`,
    hashtags: ["shorts", "learnsomething", "facts"],
    scenes: [
      { narration: `Here is something you probably didn't know about ${topic}.`, on_screen_text: "Did you know?", visual_query: "curious person" },
      { narration: "It started much earlier than most people think.", on_screen_text: "Older than you think", visual_query: "old library" },
      { narration: "And today it shapes everyday life in quiet ways.", on_screen_text: "Hidden everywhere", visual_query: "busy street" },
      { narration: "Follow for more short stories like this one.", on_screen_text: "Follow for more", visual_query: "sunset sky" },
    ],
  };
}
