import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// config reads the environment when first imported, so set it before loading the modules.
Object.assign(process.env, { META_PAGE_ID: "page1", META_PAGE_ACCESS_TOKEN: "tok", META_IG_USER_ID: "ig1" });
const { http } = await import("../src/lib/graph.js");
const { buildCaption, postFacebookReel, postInstagramReel, validateFacebookSchedule } = await import("../src/lib/meta.js");
const { parsePlatforms } = await import("../src/publish/index.js");

type Call = { url: string; method: string; body?: Record<string, string>; headers?: Record<string, string> };

// Replays canned JSON responses in order and records each request.
function fakeGraph(responses: unknown[]): Call[] {
  const calls: Call[] = [];
  http.fetch = async (input, init) => {
    const body = init?.body instanceof URLSearchParams ? Object.fromEntries(init.body) : undefined;
    calls.push({ url: String(input), method: init?.method ?? "GET", body, headers: init?.headers as Record<string, string> });
    const next = responses.shift();
    if (next === undefined) throw new Error(`Unexpected request: ${input}`);
    const status = (next as { error?: unknown }).error ? 400 : 200;
    return new Response(JSON.stringify(next), { status, headers: { "content-type": "application/json" } });
  };
  return calls;
}

const fast = { intervalMs: 1, timeoutMs: 1000 };

test("buildCaption caps hashtags at 30 and length at the limit", () => {
  const tags = Array.from({ length: 40 }, (_, i) => `tag${i}`);
  const caption = buildCaption("x".repeat(3000), tags);
  assert.ok(caption.length <= 2200);
  assert.equal(caption.match(/#/g)?.length, 30);
  assert.equal(buildCaption("Hello", ["#a", "a", "b c"]), "Hello\n\n#a #bc");
});

test("Facebook schedule window is 10 minutes to 29 days", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  assert.throws(() => validateFacebookSchedule(new Date("2026-10-22T12:05:00Z"), now), /10 minutes/);
  assert.throws(() => validateFacebookSchedule(new Date("2026-12-01T12:00:00Z"), now), /29 days/);
  assert.doesNotThrow(() => validateFacebookSchedule(new Date("2026-10-23T12:00:00Z"), now));
});

test("Facebook Reel: start, upload bytes, finish, wait for processing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fb-"));
  const file = join(dir, "video.mp4");
  await writeFile(file, "fake video");
  const calls = fakeGraph([
    { video_id: "v1", upload_url: "https://rupload.facebook.com/video-upload/v21.0/v1" },
    { success: true },
    { success: true },
    { status: { video_status: "processing" } },
    { status: { video_status: "ready" } },
  ]);
  const res = await postFacebookReel(file, "caption", { poll: fast });
  assert.equal(res.url, "https://www.facebook.com/reel/v1");
  assert.equal(calls[0].body?.upload_phase, "start");
  assert.equal(calls[1].headers?.file_size, "10");
  assert.equal(calls[1].headers?.Authorization, "OAuth tok");
  assert.equal(calls[2].body?.upload_phase, "finish");
  assert.equal(calls[2].body?.video_state, "PUBLISHED");
  assert.equal(calls.length, 5);
});

test("Facebook Reel scheduling sends SCHEDULED and a unix time", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fb-"));
  const file = join(dir, "video.mp4");
  await writeFile(file, "x");
  const calls = fakeGraph([{ video_id: "v2", upload_url: "https://rupload.facebook.com/x" }, { success: true }, { success: true }, { status: { video_status: "ready" } }]);
  const now = new Date("2026-10-22T12:00:00Z");
  const scheduleAt = new Date("2026-10-23T15:00:00Z");
  const res = await postFacebookReel(file, "c", { scheduleAt, now, poll: fast });
  assert.equal(calls[2].body?.video_state, "SCHEDULED");
  assert.equal(calls[2].body?.scheduled_publish_time, String(scheduleAt.getTime() / 1000));
  assert.equal(res.scheduledFor, scheduleAt.toISOString());
});

test("Instagram Reel: container, wait, publish, permalink", async () => {
  const calls = fakeGraph([
    { id: "c1" },
    { status_code: "IN_PROGRESS" },
    { status_code: "FINISHED" },
    { id: "m1" },
    { permalink: "https://www.instagram.com/reel/abc/" },
  ]);
  const res = await postInstagramReel("https://cdn.example.com/v.mp4", "caption", { poll: fast });
  assert.deepEqual(res, { mediaId: "m1", url: "https://www.instagram.com/reel/abc/" });
  assert.equal(calls[0].body?.media_type, "REELS");
  assert.equal(calls[0].body?.video_url, "https://cdn.example.com/v.mp4");
  assert.equal(calls[3].body?.creation_id, "c1");
});

test("Instagram processing error stops before publishing", async () => {
  const calls = fakeGraph([{ id: "c1" }, { status_code: "ERROR", status: "Unsupported format" }]);
  await assert.rejects(postInstagramReel("https://cdn.example.com/v.mp4", "c", { poll: fast }), /Unsupported format/);
  assert.equal(calls.length, 2);
});

test("Instagram rejects a non-public video URL without calling the API", async () => {
  const calls = fakeGraph([]);
  await assert.rejects(postInstagramReel("videos/abc.mp4", "c"), /public https URL/);
  assert.equal(calls.length, 0);
});

test("expired token error tells you to re-run auth", async () => {
  fakeGraph([{ error: { message: "Session has expired", code: 190 } }]);
  await assert.rejects(postInstagramReel("https://cdn.example.com/v.mp4", "c", { poll: fast }), /auth:meta/);
});

test("parsePlatforms validates names", () => {
  assert.deepEqual(parsePlatforms("YouTube, instagram,youtube"), ["youtube", "instagram"]);
  assert.throws(() => parsePlatforms("tiktok"), /Unknown platform/);
});
