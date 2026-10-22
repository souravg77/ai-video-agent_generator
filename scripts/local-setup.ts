// Gets the free, offline tools for local mode ready: FFmpeg, Ollama and its model, Piper and a voice, the footage folder.
//   npm run local:setup              (checks, downloads what's missing, sets AGENT_MODE=local in .env)
//   npm run local:setup -- --no-env  (leave .env alone)
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { parseArgs } from "node:util";
import { config } from "../src/config.js";
import { writeEnv } from "../src/lib/env-file.js";
import { piperVoiceUrl } from "../src/pipeline/piper.js";

const { values } = parseArgs({ options: { "no-env": { type: "boolean", default: false } } });
let problems = 0;
const ok = (m: string) => console.log(`✓ ${m}`);
const bad = (m: string) => {
  problems++;
  console.log(`✗ ${m}`);
};
// This script sets up local mode, so each part counts as local unless .env explicitly picks the paid service.
const wants = (key: string, local: string) => (process.env[key] ?? local) === local;
const runs = (cmd: string, args: string[]) => spawnSync(cmd, args, { stdio: "ignore" }).status === 0;

async function download(url: string, to: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  await mkdir(dirname(to), { recursive: true });
  await writeFile(to, Buffer.from(await res.arrayBuffer()));
}

// FFmpeg makes every video, in any mode.
if (runs(config.FFMPEG_PATH, ["-version"])) ok("FFmpeg");
else bad(`FFmpeg not found (${config.FFMPEG_PATH}). Install it: brew install ffmpeg, sudo apt install ffmpeg, or ffmpeg.org.`);

// Ollama runs the writing model on this machine.
if (wants("LLM_PROVIDER", "ollama")) {
  try {
    const tags = (await (await fetch(`${config.OLLAMA_URL}/api/tags`)).json()) as { models: { name: string }[] };
    const want = config.OLLAMA_MODEL.includes(":") ? config.OLLAMA_MODEL : `${config.OLLAMA_MODEL}:latest`;
    if (tags.models.some((m) => m.name === want)) ok(`Ollama with ${config.OLLAMA_MODEL}`);
    else {
      console.log(`… downloading ${config.OLLAMA_MODEL} into Ollama (several GB, can take a while)`);
      const res = await fetch(`${config.OLLAMA_URL}/api/pull`, { method: "POST", body: JSON.stringify({ model: config.OLLAMA_MODEL, stream: false }) });
      if (res.ok) ok(`Ollama with ${config.OLLAMA_MODEL}`);
      else bad(`Couldn't download ${config.OLLAMA_MODEL}: ${await res.text()}. Check the name at ollama.com/library.`);
    }
  } catch {
    bad(`Ollama isn't running at ${config.OLLAMA_URL}. Install it from ollama.com, start it (\`ollama serve\`), then run this again.`);
  }
}

// Piper speaks the narration.
if (wants("TTS_PROVIDER", "piper")) {
  let installed = runs(config.PIPER_PATH, ["--help"]);
  if (!installed) {
    console.log("… installing Piper with pip");
    const python = runs("python3", ["--version"]) ? "python3" : "python";
    if (!runs(python, ["-m", "pip", "install", "--user", "piper-tts"])) bad("Couldn't install Piper. Run `pip install piper-tts` (or `pipx install piper-tts`) yourself, or set PIPER_PATH to the piper program.");
    else if (!(installed = runs(config.PIPER_PATH, ["--help"]))) bad(`Piper installed but isn't on your PATH as \`${config.PIPER_PATH}\`. pip usually puts it in ~/.local/bin; add that to PATH or set PIPER_PATH.`);
  }
  if (installed) ok("Piper");

  if (existsSync(config.PIPER_VOICE)) ok(`Voice ${config.PIPER_VOICE}`);
  else {
    const url = piperVoiceUrl(config.PIPER_VOICE);
    if (!url) bad(`Don't know where to download ${config.PIPER_VOICE}. Pick a voice at rhasspy.github.io/piper-samples and put its .onnx and .onnx.json files there.`);
    else {
      try {
        console.log(`… downloading voice ${basename(config.PIPER_VOICE)}`);
        await download(url, config.PIPER_VOICE);
        await download(`${url}.json`, `${config.PIPER_VOICE}.json`);
        ok(`Voice ${config.PIPER_VOICE}`);
      } catch (err) {
        bad(`Voice download failed (${(err as Error).message}).`);
      }
    }
  }
}

// Your own clips, if you use them.
if (config.VISUALS_PROVIDER === "folder") {
  await mkdir(config.FOOTAGE_DIR, { recursive: true });
  ok(`Footage folder ${config.FOOTAGE_DIR}/ (put clips there named by what they show, e.g. ocean-waves.mp4)`);
}

if (!values["no-env"] && config.AGENT_MODE !== "local") {
  writeEnv({ AGENT_MODE: "local" });
  ok("Set AGENT_MODE=local in .env");
}

console.log(problems ? `\n${problems} thing(s) to fix above, then run \`npm run local:setup\` again.` : "\nLocal mode is ready. Try `npm run make -- --topic \"why the sky is blue\"`.");
process.exitCode = problems ? 1 : 0;
