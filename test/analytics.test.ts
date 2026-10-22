import assert from "node:assert/strict";
import { test } from "node:test";

// config reads the environment when first imported, so set it before loading the modules.
Object.assign(process.env, { META_PAGE_ACCESS_TOKEN: "tok", ELEVENLABS_USD_PER_1K_CHARS: "0.3" });
const { http } = await import("../src/lib/graph.js");
const { facebookStats, instagramStats, youtubeStats, youtubeWatchTime } = await import("../src/analytics/fetchers.js");
const { claudeCostUsd, voiceCostUsd } = await import("../src/lib/costs.js");
const { planningPrompt } = await import("../src/agent/planner.js");

// Answers Graph requests by matching the URL; an { error } body becomes a 400.
function fakeGraph(routes: [RegExp, unknown][]): string[] {
  const urls: string[] = [];
  http.fetch = async (input) => {
    urls.push(String(input));
    const hit = routes.find(([re]) => re.test(String(input)));
    if (!hit) throw new Error(`Unexpected request: ${input}`);
    const status = (hit[1] as { error?: unknown }).error ? 400 : 200;
    return new Response(JSON.stringify(hit[1]), { status, headers: { "content-type": "application/json" } });
  };
  return urls;
}

test("Claude cost uses per-model prices, with cache reads at a tenth", () => {
  assert.equal(claudeCostUsd("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 0 }), 4);
  assert.equal(claudeCostUsd("claude-opus-5-5", { input_tokens: 0, output_tokens: 1_000_000 }), 20);
  assert.equal(claudeCostUsd("claude-opus-5-5", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 }), 0.4);
  assert.equal(claudeCostUsd("some-future-model", { input_tokens: 1_000_000, output_tokens: 0 }), 4);
  assert.equal(voiceCostUsd(1000), 0.3);
});

test("YouTube stats batch 50 ids per call and parse string counts", async () => {
  const calls: string[][] = [];
  const client = {
    videos: {
      list: async ({ id }: { id: string[] }) => {
        calls.push(id);
        return { data: { items: id.map((v) => ({ id: v, statistics: { viewCount: "120", likeCount: "7", commentCount: "2" } })) } };
      },
    },
  };
  const ids = Array.from({ length: 51 }, (_, i) => `v${i}`);
  const stats = await youtubeStats(ids, client as never);
  assert.deepEqual(calls.map((c) => c.length), [50, 1]);
  assert.deepEqual(stats.get("v50"), { views: 120, likes: 7, comments: 2 });
});

test("YouTube watch time converts minutes to seconds", async () => {
  let query: Record<string, string> = {};
  const client = { reports: { query: async (q: Record<string, string>) => ((query = q), { data: { rows: [["abc", 2.5]] } }) } };
  const watch = await youtubeWatchTime(["abc"], new Date("2026-10-22T12:00:00Z"), client as never);
  assert.equal(watch.get("abc"), 150);
  assert.equal(query.filters, "video==abc");
  assert.equal(query.endDate, "2026-10-22");
});

test("Instagram falls back to older metric names when the new ones are rejected", async () => {
  fakeGraph([
    [/metric=views/, { error: { message: "(#100) metric[0] must be one of …", code: 100 } }],
    [/metric=reach/, { data: [{ name: "reach", values: [{ value: 900 }] }, { name: "likes", values: [{ value: 40 }] }, { name: "comments", values: [{ value: 3 }] }, { name: "shares", values: [{ value: 5 }] }] }],
  ]);
  assert.deepEqual(await instagramStats("m1"), { views: 900, likes: 40, comments: 3, shares: 5, watchTimeSec: undefined });

  fakeGraph([[/metric=views/, { data: [{ name: "views", total_value: { value: 1000 } }, { name: "ig_reels_video_view_total_time", values: [{ value: 61_000 }] }] }]]);
  assert.deepEqual(await instagramStats("m1"), { views: 1000, likes: undefined, comments: undefined, shares: undefined, watchTimeSec: 61 });
});

test("Facebook keeps likes and comments when reel insights aren't available", async () => {
  fakeGraph([
    [/video_insights/, { error: { message: "Unsupported get request", code: 100 } }],
    [/fields=likes/, { likes: { summary: { total_count: 12 } }, comments: { summary: { total_count: 4 } } }],
  ]);
  assert.deepEqual(await facebookStats("fb1"), { likes: 12, comments: 4 });

  fakeGraph([
    [/video_insights/, { data: [{ name: "blue_reels_play_count", values: [{ value: 300 }] }, { name: "post_video_view_time", values: [{ value: 90_000 }] }] }],
    [/fields=likes/, { likes: { summary: { total_count: 1 } }, comments: { summary: { total_count: 0 } } }],
  ]);
  assert.deepEqual(await facebookStats("fb1"), { likes: 1, comments: 0, views: 300, watchTimeSec: 90 });
});

test("planning prompt lists the best performers once there are view counts", () => {
  const past = [{ title: "A", views: 10 }, { title: "B", views: 5000 }, { title: "C", views: null }, { title: "D", views: 300 }];
  const prompt = planningPrompt("space facts", 3, past);
  assert.match(prompt, /Best performers so far[^]*- B \(5000 views\)\n- D \(300 views\)\n- A \(10 views\)/);
  assert.doesNotMatch(planningPrompt("space facts", 3, [{ title: "A", views: null }]), /Best performers/);
});
