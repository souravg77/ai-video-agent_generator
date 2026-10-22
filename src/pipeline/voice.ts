import { writeFile } from "node:fs/promises";
import { config } from "../config.js";
import { voiceCostUsd } from "../lib/costs.js";
import { ffmpeg } from "../lib/ffmpeg.js";
import { piperSpeak } from "./piper.js";

const WORDS_PER_SECOND = 2.5;

export function estimateSpeechSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1.5, words / WORDS_PER_SECOND);
}

// Writes an MP3 voice-over for one scene and returns what it cost.
export async function synthesizeVoice(text: string, outPath: string, opts: { offline?: boolean } = {}): Promise<number> {
  if (!opts.offline && config.TTS_PROVIDER === "piper") {
    await piperSpeak(text, outPath);
    return 0;
  }
  if (opts.offline || !config.ELEVENLABS_API_KEY) {
    if (!opts.offline) throw new Error("ELEVENLABS_API_KEY is not set. Add it to .env, use TTS_PROVIDER=piper (free, offline), or run with --offline.");
    // Silent track of the estimated speaking length, so timing and captions still line up.
    await ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", estimateSpeechSeconds(text).toFixed(2), "-q:a", "9", outPath]);
    return 0;
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${config.ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": config.ELEVENLABS_API_KEY, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
  });
  if (!res.ok) throw new Error(`ElevenLabs returned ${res.status}: ${await res.text()}`);
  await writeFile(outPath, Buffer.from(await res.arrayBuffer()));
  return voiceCostUsd(text.length);
}
