import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRenderArgs } from "../src/pipeline/render.js";
import { pickPortraitFile } from "../src/pipeline/visuals.js";

test("render args map every scene and total duration", () => {
  const args = buildRenderArgs({ visuals: ["a.mp4", "b.mp4"], voices: ["a.mp3", "b.mp3"], durations: [2, 3], assPath: "c.ass", outPath: "o.mp4" });
  const graph = args[args.indexOf("-filter_complex") + 1];
  assert.match(graph, /\[v0\]\[a0\]\[v1\]\[a1\]concat=n=2/);
  assert.equal(args[args.indexOf("-t") + 1], "5.000");
  assert.equal(args.at(-1), "o.mp4");
});

test("render args mix in music when given", () => {
  const args = buildRenderArgs({ visuals: ["a.mp4"], voices: ["a.mp3"], durations: [2], assPath: "c.ass", outPath: "o.mp4", musicPath: "m.mp3" });
  assert.match(args[args.indexOf("-filter_complex") + 1], /\[2:a\]volume=0\.12/);
  assert.equal(args[args.lastIndexOf("-map") + 1], "[aout]");
});

test("render args reject mismatched inputs", () => {
  assert.throws(() => buildRenderArgs({ visuals: ["a"], voices: [], durations: [1], assPath: "c", outPath: "o" }));
});

test("pickPortraitFile prefers the smallest portrait file at least 1080 wide", () => {
  const f = (width: number, height: number) => ({ link: `${width}x${height}`, width, height, file_type: "video/mp4" });
  assert.equal(pickPortraitFile([f(1920, 1080), f(2160, 3840), f(1080, 1920), f(720, 1280)])?.link, "1080x1920");
  assert.equal(pickPortraitFile([f(720, 1280), f(540, 960)])?.link, "720x1280");
  assert.equal(pickPortraitFile([f(1920, 1080)]), undefined);
});
