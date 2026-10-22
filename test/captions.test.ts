import assert from "node:assert/strict";
import { test } from "node:test";
import { assTime, buildAss, captionChunks, timeScenes } from "../src/pipeline/captions.js";

test("assTime formats centiseconds", () => {
  assert.equal(assTime(0), "0:00:00.00");
  assert.equal(assTime(61.234), "0:01:01.23");
  assert.equal(assTime(3725.5), "1:02:05.50");
});

test("timeScenes accumulates start times", () => {
  const scene = { narration: "a", on_screen_text: "", visual_query: "x" };
  const timed = timeScenes([scene, scene, scene], [2, 3.5, 1]);
  assert.deepEqual(timed.map((s) => s.start), [0, 2, 5.5]);
});

test("captionChunks splits into 4-word chunks covering the whole scene", () => {
  const chunks = captionChunks("one two three four five six seven", 10, 4);
  assert.deepEqual(chunks.map((c) => c.text), ["one two three four", "five six seven"]);
  assert.equal(chunks[0].start, 10);
  assert.equal(chunks.at(-1)!.end, 14);
  assert.equal(chunks[0].end, chunks[1].start);
});

test("buildAss escapes override braces and uppercases titles", () => {
  const ass = buildAss(timeScenes([{ narration: "hi {there}", on_screen_text: "Big news", visual_query: "x" }], [2]));
  assert.match(ass, /Title,,0,0,0,,BIG NEWS/);
  assert.match(ass, /Caption,,0,0,0,,hi there/);
  assert.doesNotMatch(ass, /\{there\}/);
});
