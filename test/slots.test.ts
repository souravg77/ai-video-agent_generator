import assert from "node:assert/strict";
import { test } from "node:test";
import { freeSlots, parsePostTimes, upcomingSlots } from "../src/agent/slots.js";
import { planningPrompt } from "../src/agent/planner.js";
import { esc, toInputUtc } from "../src/review/page.js";
import { parseHashtags, parseUtcInput } from "../src/review/server.js";

test("parsePostTimes sorts and validates", () => {
  assert.deepEqual(parsePostTimes("21:30, 9:05"), [{ h: 9, m: 5 }, { h: 21, m: 30 }]);
  assert.throws(() => parsePostTimes("25:00"), /Bad posting time/);
  assert.throws(() => parsePostTimes(""), /at least one/);
});

test("upcomingSlots covers the window and skips past times today", () => {
  const now = new Date("2026-10-22T16:00:00Z");
  const slots = upcomingSlots(now, 2, "15:00,21:00").map((d) => d.toISOString());
  assert.deepEqual(slots, [
    "2026-10-22T21:00:00.000Z",
    "2026-10-23T15:00:00.000Z",
    "2026-10-23T21:00:00.000Z",
    "2026-10-24T15:00:00.000Z",
  ]);
});

test("freeSlots removes taken ones", () => {
  const a = new Date("2026-10-23T15:00:00Z");
  const b = new Date("2026-10-24T15:00:00Z");
  assert.deepEqual(freeSlots([a, b], [new Date(a)]), [b]);
});

test("planning prompt lists past videos with views", () => {
  const p = planningPrompt("space facts", 3, [{ title: "Why Mars is red", views: 1200 }]);
  assert.match(p, /exactly 3/);
  assert.match(p, /Why Mars is red \(1200 views\)/);
});

test("review helpers", () => {
  assert.equal(esc(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  assert.deepEqual(parseHashtags("#space  facts,#space Mars"), ["space", "facts", "Mars"]);
  assert.equal(parseUtcInput("2026-11-01T15:00")?.toISOString(), "2026-11-01T15:00:00.000Z");
  assert.equal(parseUtcInput(""), undefined);
  assert.equal(toInputUtc(new Date("2026-11-01T15:00:00Z")), "2026-11-01T15:00");
});
