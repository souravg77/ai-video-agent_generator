import { rm, writeFile } from "node:fs/promises";
import { config } from "../config.js";
import { voiceCostUsd } from "../lib/costs.js";
import { ffmpeg } from "../lib/ffmpeg.js";
import { piperSpeak } from "./piper.js";

const WORDS_PER_SECOND = 2.5;

export const speech = { fetch: (input: string, init?: RequestInit) => fetch(input, init) };

// TTS_PROVIDER=openai-compatible: any server with an OpenAI-style /audio/speech endpoint, such as Kokoro-FastAPI
// (open-source Kokoro voices), LocalAI or openedai-speech. Re-encoded to match the other voices.
async function openAiCompatibleSpeak(text: string, outPath: string): Promise<void> {
  const base = config.TTS_BASE_URL.replace(/\/$/, "");
  let res: Response;
  try {
    res = await speech.fetch(`${base}/audio/speech`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(config.TTS_API_KEY ? { authorization: `Bearer ${config.TTS_API_KEY}` } : {}) },
      body: JSON.stringify({ model: config.TTS_MODEL, voice: config.TTS_VOICE, input: text, response_format: "mp3", speed: config.TTS_SPEED }),
    });
  } catch (err) {
    throw new Error(`Can't reach the speech server at ${base} (${(err as Error).message}). Is it running, and is TTS_BASE_URL right?`);
  }
  if (!res.ok) throw new Error(`The speech server returned ${res.status}: ${(await res.text()).slice(0, 300)}. Check TTS_MODEL and TTS_VOICE.`);
  const raw = `${outPath}.raw.mp3`;
  await writeFile(raw, Buffer.from(await res.arrayBuffer()));
  await ffmpeg(["-i", raw, "-ar", "44100", "-ac", "1", "-b:a", "128k", outPath]);
  await rm(raw, { force: true });
}

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
  if (!opts.offline && config.TTS_PROVIDER === "openai-compatible") {
    await openAiCompatibleSpeak(text, outPath);
    return 0;
  }
  if (opts.offline || !config.ELEVENLABS_API_KEY) {
    if (!opts.offline) throw new Error("ELEVENLABS_API_KEY is not set. Add it to .env, use TTS_PROVIDER=piper or openai-compatible (free, open source), or run with --offline.");
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
