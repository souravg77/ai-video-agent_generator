import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildAss, captionChunks, timeScenes } from "../src/pipeline/captions.js";
import { buildRenderArgs } from "../src/pipeline/render.js";
import { pickFile } from "../src/pipeline/visuals.js";
import { scriptSystemPrompt } from "../src/pipeline/script.js";
import { buildYouTubeMetadata } from "../src/lib/youtube.js";
import { planningPrompt } from "../src/agent/planner.js";
import { publish } from "../src/publish/index.js";
import { platformsFor } from "../src/agent/store.js";

const repo = new URL("..", import.meta.url).pathname;

test("long videos render 1920x1080 with landscape captions", () => {
  const ass = buildAss(timeScenes([{ narration: "hello there", on_screen_text: "Hi", visual_query: "x" }], [2]), { format: "long", font: "Noto Sans" });
  assert.match(ass, /PlayResX: 1920\nPlayResY: 1080/);
  assert.match(ass, /Style: Caption,Noto Sans,56/);
  const args = buildRenderArgs({ visuals: ["a.mp4"], voices: ["a.mp3"], durations: [2], assPath: "c.ass", outPath: "o.mp4", format: "long" });
  assert.match(args.join(" "), /scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080/);
  assert.match(buildAss(timeScenes([{ narration: "hi", on_screen_text: "", visual_query: "x" }], [1])), /PlayResX: 1080\nPlayResY: 1920/);
});

test("pickFile picks landscape footage for long videos", () => {
  const f = (width: number, height: number) => ({ link: `${width}x${height}`, width, height, file_type: "video/mp4" });
  const files = [f(1080, 1920), f(3840, 2160), f(1920, 1080), f(1280, 720)];
  assert.equal(pickFile(files, "long")?.link, "1920x1080");
  assert.equal(pickFile(files, "short")?.link, "1080x1920");
});

test("captions split by characters for languages without spaces", () => {
  const chunks = captionChunks("タコには心臓が三つあり、血液は青い色をしています", 0, 6);
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every((c) => [...c.text].length <= 10));
  assert.equal(chunks.at(-1)?.end, 6);
});

test("prompts follow the format and language", () => {
  assert.match(scriptSystemPrompt({ format: "long" }), /4-8 minutes/);
  assert.match(scriptSystemPrompt(), /30-60 seconds/);
  const es = scriptSystemPrompt({ language: "Spanish" });
  assert.match(es, /in Spanish/);
  assert.match(es, /visual_query in English/);
  assert.doesNotMatch(scriptSystemPrompt(), /visual_query in English/);
  assert.match(planningPrompt("space", 2, [], { format: "long", language: "Hindi" }), /4-8 minute[^]*speaks Hindi/);
});

test("long videos skip #Shorts, post only to YouTube, and use a watch URL", async () => {
  const m = buildYouTubeMetadata({ title: "t", description: "d", hashtags: ["space"], long: true });
  assert.doesNotMatch(m.snippet!.description!, /#Shorts/);
  assert.deepEqual(platformsFor("long", ["youtube", "facebook", "instagram"]), ["youtube"]);
  assert.deepEqual(platformsFor("short", ["facebook"]), ["facebook"]);
  const run = { dir: "/tmp", videoPath: "/tmp/v.mp4", format: "long" as const, script: { hook: "", title: "t", description: "d", hashtags: [], scenes: [] } };
  const [r] = await publish(run, ["instagram"]);
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.error : "", /only go to YouTube/);
});

test("BRAND loads brands/<name>.env over .env and sets schema and output folder", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brand-"));
  await mkdir(join(dir, "brands"));
  await writeFile(join(dir, ".env"), "AGENT_NICHE=shared\nVIDEO_LANGUAGE=English\n");
  await writeFile(join(dir, "brands", "Cook-ing.env"), "AGENT_NICHE=cooking\n");
  const script = `import(${JSON.stringify(join(repo, "src/config.ts"))}).then(({ config }) => console.log(JSON.stringify([config.AGENT_NICHE, config.VIDEO_LANGUAGE, config.DB_SCHEMA, config.OUT_DIR])))`;
  const run = (env: Record<string, string>) =>
    execFileSync(join(repo, "node_modules/.bin/tsx"), ["-e", script], { cwd: dir, env: { PATH: process.env.PATH, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.deepEqual(JSON.parse(run({ BRAND: "Cook-ing" })), ["cooking", "English", "cook_ing", "out/Cook-ing"]);
  assert.deepEqual(JSON.parse(run({})), ["shared", "English", null, "out"]);
  assert.throws(() => run({ BRAND: "missing" }), /brands\/missing\.env doesn't exist/);
});
