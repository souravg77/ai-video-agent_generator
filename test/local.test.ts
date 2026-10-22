import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// config reads the environment when first imported, so set it before loading the modules.
const tmp = await mkdtemp(join(tmpdir(), "local-mode-"));
const fakePiper = join(tmp, "fake-piper.sh");
// Stands in for Piper: saves the text it was given and writes one second of silence to --output_file.
await writeFile(
  fakePiper,
  `#!/bin/sh
while [ $# -gt 0 ]; do case "$1" in --output_file) out="$2"; shift;; esac; shift; done
cat > "$out.txt"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i anullsrc=r=22050:cl=mono -t 1 "$out"
`,
);
await chmod(fakePiper, 0o755);
await writeFile(join(tmp, "voice.onnx"), "fake");
delete process.env.DATABASE_URL;
Object.assign(process.env, {
  AGENT_MODE: "local",
  OLLAMA_URL: "http://ollama.test:11434",
  OLLAMA_MODEL: "qwen3:14b",
  PIPER_PATH: fakePiper,
  PIPER_VOICE: join(tmp, "voice.onnx"),
});
const { config } = await import("../src/config.js");
const { askJson, ollama } = await import("../src/lib/llm.js");
const { generateScript } = await import("../src/pipeline/script.js");
const { piperSpeak, piperVoiceUrl } = await import("../src/pipeline/piper.js");
const { pickFromFolder, generatedBackground } = await import("../src/pipeline/visuals.js");
const { exportForUpload, uploadText, slugify } = await import("../src/publish/manual.js");
const { z } = await import("zod/v4");

const script = {
  hook: "Octopuses have three hearts.",
  title: "Why octopuses have three hearts",
  description: "Two pump blood through the gills, one through the body.",
  hashtags: ["octopus", "#ocean facts"],
  scenes: [{ narration: "Octopuses have three hearts.", on_screen_text: "3 hearts", visual_query: "octopus reef" }],
};

type Call = { url: string; body: any };
function fakeOllama(replies: (string | number)[]): Call[] {
  const calls: Call[] = [];
  ollama.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) });
    const r = replies.shift()!;
    if (typeof r === "number") return new Response("not found", { status: r });
    return Response.json({ message: { role: "assistant", content: r } });
  };
  return calls;
}

const probe = (file: string) =>
  JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", file], { encoding: "utf8" }));

test("AGENT_MODE=local picks the free provider for every step", () => {
  assert.equal(config.LLM_PROVIDER, "ollama");
  assert.equal(config.TTS_PROVIDER, "piper");
  assert.equal(config.VISUALS_PROVIDER, "generated");
  assert.equal(config.PUBLISH_MODE, "manual");
});

test("Ollama: sends the JSON schema, validates the answer, retries once with the problem, and costs nothing", async () => {
  const calls = fakeOllama(["not json", JSON.stringify({ n: "three" }), JSON.stringify({ n: 3 })]);
  await assert.rejects(
    askJson({ schema: z.object({ n: z.number() }), user: "how many hearts?", maxTokens: 100, what: "count hearts" }),
    /did not match the expected format \(count hearts\).*n:/,
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "http://ollama.test:11434/api/chat");
  assert.equal(calls[0].body.model, "qwen3:14b");
  assert.equal(calls[0].body.stream, false);
  assert.equal(calls[0].body.format.type, "object");
  assert.deepEqual(calls[0].body.format.required, ["n"]);
  assert.match(calls[1].body.messages.at(-1).content, /not valid JSON/);

  fakeOllama([JSON.stringify({ n: "three" }), JSON.stringify({ n: 3 })]);
  const answer = await askJson({ schema: z.object({ n: z.number() }), user: "how many hearts?", maxTokens: 100, what: "count hearts" });
  assert.deepEqual(answer, { data: { n: 3 }, costUsd: 0 });
});

test("Ollama: clear errors when the model is missing or the server is down", async () => {
  fakeOllama([404]);
  await assert.rejects(askJson({ schema: z.object({}), user: "x", maxTokens: 10, what: "x" }), /ollama pull qwen3:14b/);
  ollama.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(askJson({ schema: z.object({}), user: "x", maxTokens: 10, what: "x" }), /ollama serve/);
});

test("scripts are written by the local model and cleaned like Claude's", async () => {
  const calls = fakeOllama([JSON.stringify(script)]);
  const { script: out, costUsd } = await generateScript("octopus hearts");
  assert.equal(costUsd, 0);
  assert.deepEqual(out.hashtags, ["octopus", "oceanfacts"]);
  assert.match(calls[0].body.messages[0].content, /faceless vertical short videos/);
  assert.match(calls[0].body.messages[1].content, /octopus hearts/);
});

test("Piper: speaks the text and converts it to mp3", async () => {
  const out = join(tmp, "voice.mp3");
  await piperSpeak("Hello from Piper.", out);
  const info = probe(out);
  assert.equal(info.streams[0].codec_type, "audio");
  assert.ok(Number(info.format.duration) > 0.9);
  assert.equal(await readFile(`${out}.wav.txt`, "utf8"), "Hello from Piper.");
  assert.ok(!(await readdir(tmp)).includes("voice.mp3.wav"), "the wav is removed");
});

test("Piper voice download links follow the piper-voices layout", () => {
  assert.equal(
    piperVoiceUrl("models/en_US-lessac-medium.onnx"),
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx",
  );
  assert.equal(piperVoiceUrl("models/es_ES-davefx-medium.onnx")?.includes("/es/es_ES/davefx/medium/"), true);
  assert.equal(piperVoiceUrl("models/my-voice.onnx"), undefined);
});

test("footage folder: picks the clip whose name matches the scene, without repeats while others are left", async () => {
  const dir = join(tmp, "footage");
  await mkdir(join(dir, "nature"), { recursive: true });
  for (const f of ["nature/ocean-waves-sunset.mp4", "nature/forest-rain.mov", "city-traffic-night.mp4", "notes.txt"]) await writeFile(join(dir, f), "");
  const used = new Set<string>();
  assert.equal(await pickFromFolder("ocean waves at sunset", dir, used), join(dir, "nature/ocean-waves-sunset.mp4"));
  assert.equal(await pickFromFolder("city traffic", dir, used), join(dir, "city-traffic-night.mp4"));
  // Best match is used already, so another clip is picked.
  assert.notEqual(await pickFromFolder("ocean waves", dir, used), join(dir, "nature/ocean-waves-sunset.mp4"));
  assert.equal(used.size, 3);
  // All used: reuse the best match rather than fail.
  assert.equal(await pickFromFolder("ocean waves", dir, used), join(dir, "nature/ocean-waves-sunset.mp4"));
  await assert.rejects(pickFromFolder("x", join(tmp, "missing"), new Set()), /No video clips/);
});

test("generated backgrounds fill the frame for the scene's length", async () => {
  const out = join(tmp, "bg.mp4");
  await generatedBackground(out, 1.5, "short", 2);
  const info = probe(out);
  assert.equal(info.streams[0].width, 1080);
  assert.equal(info.streams[0].height, 1920);
  assert.ok(Math.abs(Number(info.format.duration) - 1.5) < 0.1);
});

test("manual publish exports the video and each platform's text into one folder", async () => {
  const runDir = join(tmp, "run");
  await mkdir(runDir);
  await writeFile(join(runDir, "video.mp4"), "mp4 bytes");
  const run = { dir: runDir, videoPath: join(runDir, "video.mp4"), script, format: "short" as const };
  const { dir, results } = await exportForUpload(run, ["youtube", "facebook", "instagram"], join(tmp, "out"), new Date("2026-11-01T15:00:00Z"));

  assert.equal(dir, join(tmp, "out", "ready", "2026-11-01-why-octopuses-have-three-hearts"));
  assert.deepEqual(results.map((r) => r.ok), [true, true, true]);
  assert.deepEqual((await readdir(dir)).sort(), ["UPLOAD.md", "facebook.txt", "instagram.txt", "video.mp4", "youtube.txt"]);
  assert.equal(await readFile(join(dir, "video.mp4"), "utf8"), "mp4 bytes");
  const yt = await readFile(join(dir, "youtube.txt"), "utf8");
  assert.match(yt, /^TITLE\nWhy octopuses have three hearts\n\nDESCRIPTION\nTwo pump/);
  assert.match(yt, /#Shorts #octopus #oceanfacts/);
  assert.equal(await readFile(join(dir, "instagram.txt"), "utf8"), "Two pump blood through the gills, one through the body.\n\n#octopus #oceanfacts\n");
  assert.match(await readFile(join(dir, "UPLOAD.md"), "utf8"), /Instagram: upload video.mp4 and paste instagram.txt as the caption/);
});

test("manual publish of a long video only exports YouTube", async () => {
  const runDir = join(tmp, "run-long");
  await mkdir(runDir);
  await writeFile(join(runDir, "video.mp4"), "x");
  await writeFile(join(runDir, "thumbnail.jpg"), "jpg");
  const run = { dir: runDir, videoPath: join(runDir, "video.mp4"), script, format: "long" as const };
  const { dir, results } = await exportForUpload(run, ["youtube", "facebook"], join(tmp, "out-long"));
  assert.equal(results[1].ok, false);
  assert.deepEqual((await readdir(dir)).sort(), ["UPLOAD.md", "thumbnail.jpg", "video.mp4", "youtube.txt"]);
  assert.doesNotMatch(uploadText("youtube", script, true).caption, /#Shorts/);
  assert.equal(slugify("¿Qué es? Ñandú & more!"), "que-es-nandu-more");
  assert.equal(slugify("タコのジャンプ"), "タコのジャンプ");
});
