import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeScript, sampleScript, VideoScriptSchema } from "../src/pipeline/script.js";

test("sample script matches the schema", () => {
  assert.doesNotThrow(() => VideoScriptSchema.parse(sampleScript("octopuses")));
});

test("normalizeScript cleans hashtags, drops empty scenes, caps title", () => {
  const s = normalizeScript({
    ...sampleScript("x"),
    title: "t".repeat(150),
    hashtags: ["#Shorts", "shorts", "#Shorts", "two words", ""],
    scenes: [
      { narration: "  real line ", on_screen_text: " hi ", visual_query: "q" },
      { narration: "   ", on_screen_text: "", visual_query: "q" },
    ],
  });
  assert.equal(s.title.length, 100);
  assert.deepEqual(s.hashtags, ["Shorts", "shorts", "twowords"]);
  assert.equal(s.scenes.length, 1);
  assert.equal(s.scenes[0].narration, "real line");
});

test("normalizeScript rejects a script with no narration", () => {
  assert.throws(() => normalizeScript({ ...sampleScript("x"), scenes: [{ narration: " ", on_screen_text: "", visual_query: "q" }] }));
});
