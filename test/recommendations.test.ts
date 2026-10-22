import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// config reads the environment when first imported, so set it before loading the modules.
Object.assign(process.env, {
  TELEGRAM_BOT_TOKEN: "tgtoken",
  TELEGRAM_CHAT_ID: "42",
  FAL_KEY: "falkey",
  GENERATED_CLIPS: "hook",
  GENERATED_CLIP_SECONDS: "5",
  GENERATED_CLIP_USD_PER_SECOND: "0.2",
  PRIVACY_OWNER_NAME: "Shawn's Channels",
  PRIVACY_CONTACT_EMAIL: "owner@example.com",
});
const { chooseHookStyle, HOOK_STYLES } = await import("../src/pipeline/hooks.js");
const { scriptSystemPrompt } = await import("../src/pipeline/script.js");
const { parsePlatformDelays } = await import("../src/agent/worker.js");
const { thumbnailAss } = await import("../src/pipeline/thumbnail.js");
const { renderPrivacyPage } = await import("../src/review/privacy.js");
const { tg, sendForReview, reviewCaption } = await import("../src/agent/telegram.js");
const { fal, generateClip, generatedClipsEnabled } = await import("../src/pipeline/generated.js");

test("hook styles: every style is tried 3 times, then the best wins most of the time", () => {
  const styles = Object.keys(HOOK_STYLES);
  assert.equal(chooseHookStyle([]), styles[0]);
  const stats = styles.map((style, i) => ({ style, videos: 3, avgViews: style === "story" ? 9000 : 100 * i }));
  stats[1].videos = 1;
  assert.equal(chooseHookStyle(stats), styles[1]); // least-tried first
  stats[1].videos = 3;
  assert.equal(chooseHookStyle(stats, () => 0.9), "story"); // exploit
  assert.ok(styles.includes(chooseHookStyle(stats, () => 0.1))); // explore
  assert.match(scriptSystemPrompt({ hookStyle: "question" }), /hook must be a direct question/);
});

test("platform delays parse and reject typos", () => {
  assert.deepEqual(parsePlatformDelays("facebook=60, Instagram=120"), { facebook: 60, instagram: 120 });
  assert.deepEqual(parsePlatformDelays(undefined), {});
  assert.throws(() => parsePlatformDelays("tiktok=5"), /instagram=120/);
});

test("thumbnail text is big, uppercase and safe for ASS", () => {
  const ass = thumbnailAss("Why {octopuses} have 3 hearts");
  assert.match(ass, /PlayResX: 1280\nPlayResY: 720/);
  assert.match(ass, /,WHY OCTOPUSES HAVE 3 HEARTS\n$/);
});

test("privacy and data deletion pages name the owner, contact and Google's policy", () => {
  const privacy = renderPrivacyPage("privacy");
  assert.match(privacy, /Shawn&#39;s Channels/);
  assert.match(privacy, /mailto:owner@example.com/);
  assert.match(privacy, /API Services User Data Policy/);
  assert.match(renderPrivacyPage("data-deletion"), /within 30 days/);
});

test("Telegram review messages carry the video and Approve/Reject buttons", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tg-"));
  await writeFile(join(dir, "video.mp4"), "fake mp4");
  const calls: { url: string; body: unknown }[] = [];
  tg.fetch = async (url, init) => {
    calls.push({ url, body: init?.body });
    return new Response(JSON.stringify({ ok: true, result: {} }));
  };
  const v = {
    id: "11111111-1111-1111-1111-111111111111",
    topic: "t",
    title: "Octopus hearts",
    description: "Three of them.",
    publish_at: new Date("2026-10-23T15:00:00Z"),
    platforms: ["youtube", "instagram"],
    local_dir: dir,
  } as never;
  await sendForReview(v);
  assert.match(calls[0].url, /bottgtoken\/sendVideo$/);
  const form = calls[0].body as FormData;
  assert.equal(form.get("chat_id"), "42");
  assert.match(String(form.get("reply_markup")), /approve:11111111-1111-1111-1111-111111111111/);
  assert.ok(form.get("video") instanceof Blob);
  assert.match(reviewCaption(v), /Needs review: Octopus hearts\nPosts 2026-10-23 15:00 UTC to youtube, instagram/);
});

test("generated clips go through fal.ai's queue and cost seconds × rate", async () => {
  assert.ok(generatedClipsEnabled());
  const seen: string[] = [];
  let polls = 0;
  fal.pollMs = 1;
  fal.fetch = async (url, init) => {
    seen.push(`${init?.method ?? "GET"} ${url}`);
    if (url.startsWith("https://queue.fal.run/fal-ai/")) {
      assert.equal(JSON.parse(String(init?.body)).aspect_ratio, "9:16");
      return Response.json({ status_url: "https://queue.fal.run/s", response_url: "https://queue.fal.run/r" });
    }
    if (url.endsWith("/s")) return Response.json({ status: ++polls < 2 ? "IN_PROGRESS" : "COMPLETED" });
    if (url.endsWith("/r")) return Response.json({ video: { url: "https://cdn.example/clip.mp4" } });
    return new Response("clip-bytes");
  };
  const out = join(await mkdtemp(join(tmpdir(), "fal-")), "v.mp4");
  assert.equal(await generateClip("a prompt", out, "short"), 1);
  assert.equal(await readFile(out, "utf8"), "clip-bytes");
  assert.equal(polls, 2);
  assert.equal(seen.at(-1), "GET https://cdn.example/clip.mp4");
});
