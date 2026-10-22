import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { youtube_v3 } from "googleapis";
import { buildYouTubeMetadata, explainYouTubeError, fitTags, uploadToYouTube } from "../src/lib/youtube.js";

const base = { title: "Why octopuses have three hearts", description: "A short explainer.", hashtags: ["octopus", "#science"] };
const now = new Date("2026-10-22T12:00:00Z");

test("metadata defaults to private, adds #Shorts and hashtags to the description", () => {
  const m = buildYouTubeMetadata({ ...base, now });
  assert.equal(m.status?.privacyStatus, "private");
  assert.equal(m.status?.containsSyntheticMedia, false);
  assert.equal(m.status?.selfDeclaredMadeForKids, false);
  assert.match(m.snippet!.description!, /#Shorts #octopus #science$/);
  assert.deepEqual(m.snippet?.tags, ["octopus", "science"]);
});

test("scheduling forces private and sets publishAt", () => {
  const publishAt = new Date("2026-11-01T15:00:00Z");
  const m = buildYouTubeMetadata({ ...base, privacy: "public", publishAt, now });
  assert.equal(m.status?.privacyStatus, "private");
  assert.equal(m.status?.publishAt, "2026-11-01T15:00:00.000Z");
});

test("scheduling in the past is rejected", () => {
  assert.throws(() => buildYouTubeMetadata({ ...base, publishAt: new Date("2026-10-01T00:00:00Z"), now }), /future/);
});

test("title and description respect YouTube limits and drop angle brackets", () => {
  const m = buildYouTubeMetadata({ ...base, title: `<b>${"x".repeat(200)}`, description: "é".repeat(4000), now });
  assert.equal(m.snippet!.title!.length, 100);
  assert.ok(!m.snippet!.title!.includes("<"));
  assert.ok(Buffer.byteLength(m.snippet!.description!, "utf8") <= 5000);
});

test("fitTags stays within 500 characters", () => {
  const tags = fitTags(Array.from({ length: 100 }, (_, i) => `tag number ${i}`));
  const total = tags.reduce((n, t, i) => n + t.length + 2 + (i ? 1 : 0), 0);
  assert.ok(total <= 500);
  assert.ok(tags.length > 10);
});

test("explainYouTubeError gives actionable messages", () => {
  assert.match(explainYouTubeError({ errors: [{ reason: "quotaExceeded" }] }).message, /quota/);
  assert.match(explainYouTubeError(new Error("invalid_grant")).message, /auth:youtube/);
});

function fakeClient(responses: (() => unknown)[]): { client: youtube_v3.Youtube; calls: unknown[] } {
  const calls: unknown[] = [];
  const client = {
    videos: {
      insert: async (params: unknown) => {
        calls.push(params);
        return responses[calls.length - 1]();
      },
    },
  } as unknown as youtube_v3.Youtube;
  return { client, calls };
}

test("uploadToYouTube returns the Shorts URL and retries server errors", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yt-"));
  const file = join(dir, "video.mp4");
  await writeFile(file, "fake");
  const { client, calls } = fakeClient([
    () => { throw Object.assign(new Error("backend"), { status: 503 }); },
    () => ({ data: { id: "abc123", status: { privacyStatus: "private" } } }),
  ]);
  const res = await uploadToYouTube(file, buildYouTubeMetadata({ ...base, now }), { client, retries: 1 });
  assert.equal(res.url, "https://youtube.com/shorts/abc123");
  assert.equal(calls.length, 2);
});

test("uploadToYouTube does not retry quota errors", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yt-"));
  const file = join(dir, "video.mp4");
  await writeFile(file, "fake");
  const { client, calls } = fakeClient([() => { throw Object.assign(new Error("quota"), { status: 403, errors: [{ reason: "quotaExceeded" }] }); }]);
  await assert.rejects(uploadToYouTube(file, buildYouTubeMetadata({ ...base, now }), { client, retries: 3 }), /quota/);
  assert.equal(calls.length, 1);
});
