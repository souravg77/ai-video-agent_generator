import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { basename } from "node:path";
import { config } from "../config.js";
import { ffmpeg } from "../lib/ffmpeg.js";

// Piper (github.com/OHF-Voice/piper1-gpl) speaks text offline from a small voice model file. Free, no account.
export async function piperSpeak(text: string, outMp3: string): Promise<void> {
  if (!existsSync(config.PIPER_VOICE)) {
    throw new Error(`Piper voice not found at ${config.PIPER_VOICE}. Run \`npm run local:setup\` to download one, or set PIPER_VOICE.`);
  }
  const wav = `${outMp3}.wav`;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(config.PIPER_PATH, ["--model", config.PIPER_VOICE, "--output_file", wav], { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => reject(new Error(`Could not start Piper (${e.message}). Install it with \`pip install piper-tts\` or set PIPER_PATH.`)));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Piper exited with ${code}: ${err.split("\n").slice(-5).join("\n")}`))));
    child.stdin.end(text);
  });
  await ffmpeg(["-i", wav, "-ar", "44100", "-ac", "1", "-b:a", "128k", outMp3]);
  await rm(wav, { force: true });
}

// Piper voices live at huggingface.co/rhasspy/piper-voices, in <lang>/<lang_REGION>/<name>/<quality>/.
export function piperVoiceUrl(file: string): string | undefined {
  const m = /^(([a-z]{2,3})_[A-Z]{2})-(.+)-(x_low|low|medium|high)\.onnx$/.exec(basename(file));
  if (!m) return undefined;
  const [, locale, lang, name, quality] = m;
  return `https://huggingface.co/rhasspy/piper-voices/resolve/main/${lang}/${locale}/${name}/${quality}/${basename(file)}`;
}
