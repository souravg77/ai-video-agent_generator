import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// config reads the environment when first imported, so set it before loading the modules.
Object.assign(process.env, {
  LLM_PROVIDER: "openai-compatible",
  OPENAI_BASE_URL: "https://models.test/v1/",
  OPENAI_MODEL: "Qwen/Qwen3-14B",
  OPENAI_API_KEY: "hosted-key",
  OPENAI_USD_PER_1M_INPUT: "0.5",
  OPENAI_USD_PER_1M_OUTPUT: "1",
  TTS_PROVIDER: "openai-compatible",
  TTS_BASE_URL: "http://kokoro.test:8880/v1",
  TTS_VOICE: "bf_emma",
  VISUALS_PROVIDER: "generated-local",
  IMAGE_API: "openai",
  IMAGE_BASE_URL: "http://images.test:8080/v1/",
  IMAGE_MODEL: "flux.1-schnell",
});
const { askJson, openai } = await import("../src/lib/llm.js");
const { synthesizeVoice, speech } = await import("../src/pipeline/voice.js");
const { fetchVisual, imageApi } = await import("../src/pipeline/visuals.js");
const { scriptSystemPrompt } = await import("../src/pipeline/script.js");
const { config } = await import("../src/config.js");
const { envForChoices, keysToAsk, OPEN_MODEL_SERVERS } = await import("../src/lib/setup-choices.js");
const { z } = await import("zod/v4");

type Call = { url: string; headers: Record<string, string>; body: any };
function fakeServer(replies: (Response | string)[]): Call[] {
  const calls: Call[] = [];
  openai.fetch = async (url, init) => {
    calls.push({ url, headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
    const r = replies.shift()!;
    if (r instanceof Response) return r;
    return Response.json({ choices: [{ message: { role: "assistant", content: r } }], usage: { prompt_tokens: 1000, completion_tokens: 2000 } });
  };
  return calls;
}
const Hearts = z.object({ hearts: z.number() });

test("open-source model server: sends the schema, the model and the key, and tracks hosted token cost", async () => {
  const calls = fakeServer(['{"hearts": 3}']);
  const answer = await askJson({ schema: Hearts, system: "You count.", user: "octopus?", maxTokens: 200, what: "count" });
  assert.deepEqual(answer.data, { hearts: 3 });
  assert.ok(Math.abs(answer.costUsd - 0.0025) < 1e-9); // 1,000 in at $0.50/M + 2,000 out at $1/M
  assert.equal(calls[0].url, "https://models.test/v1/chat/completions");
  assert.equal(calls[0].headers.authorization, "Bearer hosted-key");
  assert.equal(calls[0].body.model, "Qwen/Qwen3-14B");
  assert.equal(calls[0].body.max_tokens, 200);
  assert.equal(calls[0].body.response_format.type, "json_schema");
  assert.deepEqual(calls[0].body.response_format.json_schema.schema.required, ["hearts"]);
  assert.match(calls[0].body.messages[0].content, /^You count\.\n\nReply with a single JSON object/);
});

test("open-source model server: falls back to JSON mode when schemas are rejected, and strips code fences", async () => {
  const calls = fakeServer([new Response("response_format json_schema not supported", { status: 400 }), '```json\n{"hearts": 3}\n```']);
  const answer = await askJson({ schema: Hearts, user: "octopus?", maxTokens: 200, what: "count" });
  assert.deepEqual(answer.data, { hearts: 3 });
  assert.deepEqual(calls.map((c) => c.body.response_format.type), ["json_schema", "json_object"]);
});

test("open-source model server: retries once with the validation problem, then explains", async () => {
  const calls = fakeServer(['{"hearts": "three"}', '{"hearts": "three"}']);
  await assert.rejects(askJson({ schema: Hearts, user: "octopus?", maxTokens: 200, what: "count" }), /The model Qwen\/Qwen3-14B's answer did not match.*hearts.*OPENAI_MODEL/);
  assert.equal(calls.length, 2);
  assert.match(calls[1].body.messages.at(-1).content, /hearts/);
});

test("open-source model server: clear errors for a bad key, an unknown model and a server that's down", async () => {
  fakeServer([new Response("", { status: 401 })]);
  await assert.rejects(askJson({ schema: Hearts, user: "x", maxTokens: 10, what: "x" }), /OPENAI_API_KEY/);
  fakeServer([new Response("", { status: 404 })]);
  await assert.rejects(askJson({ schema: Hearts, user: "x", maxTokens: 10, what: "x" }), /doesn't know the model "Qwen\/Qwen3-14B"/);
  openai.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(askJson({ schema: Hearts, user: "x", maxTokens: 10, what: "x" }), /Can't reach the model server at https:\/\/models.test\/v1/);
});

test("Kokoro voice: calls the speech endpoint and re-encodes to 44.1 kHz mono mp3", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kokoro-"));
  const sample = join(dir, "sample.mp3");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=f=300:r=24000", "-t", "1", sample]);
  let sent: any;
  speech.fetch = async (url, init) => {
    sent = { url, body: JSON.parse(String(init?.body)) };
    return new Response(await readFile(sample), { headers: { "content-type": "audio/mpeg" } });
  };
  const out = join(dir, "voice.mp3");
  assert.equal(await synthesizeVoice("Octopuses have three hearts.", out), 0);
  assert.equal(sent.url, "http://kokoro.test:8880/v1/audio/speech");
  assert.deepEqual(sent.body, { model: "kokoro", voice: "bf_emma", input: "Octopuses have three hearts.", response_format: "mp3", speed: 1 });
  const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=sample_rate,channels", "-of", "json", out], { encoding: "utf8" }));
  assert.deepEqual(info.streams[0], { sample_rate: "44100", channels: 1 });
  assert.deepEqual(await readdir(dir), ["sample.mp3", "voice.mp3"]);

  speech.fetch = async () => new Response("unknown voice", { status: 400 });
  await assert.rejects(synthesizeVoice("x", join(dir, "bad.mp3")), /400: unknown voice\. Check TTS_MODEL and TTS_VOICE/);
});

test("setup: open-source choices need no paid keys and count as local", () => {
  const c = { writing: "openai-compatible", voice: "openai-compatible", footage: "generated", posting: "manual", platforms: ["youtube"] } as const;
  const env = envForChoices({ ...c, platforms: ["youtube"] });
  assert.equal(env.AGENT_MODE, "local");
  assert.equal(env.LLM_PROVIDER, "openai-compatible");
  assert.deepEqual(keysToAsk({ ...c, platforms: ["youtube"] }), []);
  assert.ok(OPEN_MODEL_SERVERS.every((s) => !s.url || s.url.endsWith("/v1")));
});

test("setup: local AI footage counts as local and needs no paid keys", () => {
  const c = { writing: "ollama", voice: "piper", footage: "generated-local", posting: "manual", platforms: ["youtube"] } as const;
  const env = envForChoices({ ...c, platforms: ["youtube"] });
  assert.equal(env.AGENT_MODE, "local");
  assert.equal(env.VISUALS_PROVIDER, "generated-local");
  assert.deepEqual(keysToAsk({ ...c, platforms: ["youtube"] }), []);
});

test("local AI footage: calls the image endpoint and animates the still into a scene-length clip", async () => {
  const dir = await mkdtemp(join(tmpdir(), "localfootage-"));
  // A real PNG for the server to "generate", made with ffmpeg.
  const png = join(dir, "src.png");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=s=832x1216:d=1", "-frames:v", "1", png]);
  const b64 = (await readFile(png)).toString("base64");

  let sent: any;
  imageApi.fetch = async (url, init) => {
    sent = { url, body: JSON.parse(String(init?.body)) };
    return Response.json({ data: [{ b64_json: b64 }] });
  };
  const out = join(dir, "visual-0.mp4");
  await fetchVisual("ancient roman marketplace", out, 4.2, { sceneIndex: 0, format: "short" });

  assert.equal(sent.url, "http://images.test:8080/v1/images/generations");
  assert.equal(sent.body.model, "flux.1-schnell");
  assert.equal(sent.body.n, 1);
  assert.equal(sent.body.size, "832x1216");
  assert.match(sent.body.prompt, /ancient roman marketplace/);

  // A 1080x1920, ~4.2s h264 clip, and the temporary source image is cleaned up.
  const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_name:format=duration", "-of", "json", out], { encoding: "utf8" }));
  assert.equal(info.streams[0].width, 1080);
  assert.equal(info.streams[0].height, 1920);
  assert.equal(info.streams[0].codec_name, "h264");
  assert.ok(Math.abs(Number(info.format.duration) - 4.2) < 0.2, `duration ${info.format.duration}`);
  assert.deepEqual(await readdir(dir), ["src.png", "visual-0.mp4"]);

  imageApi.fetch = async () => new Response("model not found", { status: 404 });
  await assert.rejects(fetchVisual("x", join(dir, "bad.mp4"), 2, { sceneIndex: 0, format: "short" }), /404: model not found\. Check IMAGE_MODEL/);
});

test("local AI footage via ComfyUI: queues a workflow, polls history, fetches the image into a clip", async () => {
  const dir = await mkdtemp(join(tmpdir(), "comfy-"));
  const png = join(dir, "src.png");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=s=768x1344:d=1", "-frames:v", "1", png]);
  const img = await readFile(png);

  // Switch the live config to the ComfyUI path for this test, then restore.
  const savedApi = config.IMAGE_API, savedUrl = config.IMAGE_BASE_URL, savedModel = config.IMAGE_MODEL;
  config.IMAGE_API = "comfyui"; config.IMAGE_BASE_URL = "http://comfy.test:8188"; config.IMAGE_MODEL = "flux1-schnell-fp8.safetensors";
  try {
    let queued: any = null, polls = 0, viewed = "";
    imageApi.fetch = async (url, init) => {
      if (url.endsWith("/prompt")) { queued = JSON.parse(String(init?.body)); return Response.json({ prompt_id: "pid-1" }); }
      if (url.includes("/history/")) { polls++; return Response.json(polls < 2 ? {} : { "pid-1": { outputs: { "7": { images: [{ filename: "sgain_1.png", subfolder: "", type: "output" }] } } } }); }
      if (url.includes("/view")) { viewed = url; return new Response(img, { headers: { "content-type": "image/png" } }); }
      throw new Error("unexpected url " + url);
    };
    const out = join(dir, "visual-0.mp4");
    await fetchVisual("a cozy cottage in the woods", out, 3, { sceneIndex: 0, format: "short" });

    // The workflow carried the model, prompt and numeric size/seed.
    assert.equal(queued.client_id, "sgain-studio");
    assert.equal(queued.prompt["1"].inputs.ckpt_name, "flux1-schnell-fp8.safetensors");
    assert.match(queued.prompt["2"].inputs.text, /cozy cottage in the woods/);
    assert.equal(queued.prompt["4"].inputs.width, 832);
    assert.equal(typeof queued.prompt["5"].inputs.seed, "number");
    assert.ok(polls >= 2, "polled history until outputs appeared");
    assert.ok(viewed && viewed.includes("filename=sgain_1.png"), "fetched the saved image via /view");

    const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", out], { encoding: "utf8" }));
    assert.equal(info.streams[0].width, 1080);
    assert.equal(info.streams[0].height, 1920);
    assert.ok(Math.abs(Number(info.format.duration) - 3) < 0.2);
  } finally {
    config.IMAGE_API = savedApi; config.IMAGE_BASE_URL = savedUrl; config.IMAGE_MODEL = savedModel;
  }
});

test("script length: an explicit minutes target changes the scene/length brief", () => {
  const short = scriptSystemPrompt({ format: "long" });
  const oneMin = scriptSystemPrompt({ format: "long", minutes: 1 });
  assert.match(short, /4-8 minutes/);
  assert.match(oneMin, /about 60 seconds/);
  assert.doesNotMatch(oneMin, /25 to 50 scenes/);
});
