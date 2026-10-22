// Runs the agent and review page against a real Postgres. Skipped unless TEST_DATABASE_URL is set,
// e.g. TEST_DATABASE_URL=postgres://postgres@localhost:5432/agent_test npm test
// The database's tables are emptied, so never point this at real data.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, test } from "node:test";

const url = process.env.TEST_DATABASE_URL;

describe("agent with Postgres", { skip: !url && "set TEST_DATABASE_URL to run" }, async () => {
  process.env.DATABASE_URL = url;
  const { db, closeDb, updateVideo } = await import("../src/lib/db.js");
  const store = await import("../src/agent/store.js");
  const { tick, planAhead } = await import("../src/agent/worker.js");
  const { recordPost } = await import("../src/publish/record.js");
  const { startReviewServer } = await import("../src/review/server.js");
  const { collectStats } = await import("../src/analytics/collect.js");
  const { buildReport, reportText } = await import("../src/analytics/report.js");
  const comments = await import("../src/comments/index.js");
  type Deps = import("../src/agent/worker.js").AgentDeps;
  type Platform = import("../src/lib/db.js").Platform;

  const now = new Date("2026-10-22T12:00:00Z");
  const settings = { postTimesUtc: "15:00", planDays: 3, renderLeadHours: 36, autoApprove: false, platforms: ["youtube", "instagram"] as Platform[] };

  let failing = new Set<Platform>();
  let publishCalls: Platform[] = [];
  let alerts: string[] = [];

  function deps(overrides: Partial<Deps> = {}): Deps {
    let n = 0;
    return {
      settings,
      planner: async (count) => Array.from({ length: count }, () => ({ topic: `idea ${++n}`, angle: "an angle" })),
      render: async (v) => {
        const script = { hook: "h", title: `Title for ${v.topic}`, description: "desc", hashtags: ["tag"], scenes: [{ narration: "n", on_screen_text: "", visual_query: "q" }] };
        await updateVideo(v.id, { script, title: script.title, description: script.description, hashtags: script.hashtags, local_dir: "/tmp/none" });
      },
      publish: async (run, platforms) => {
        const results = [];
        for (const platform of platforms) {
          publishCalls.push(platform);
          try {
            const outcome = await recordPost(run, platform, undefined, async () => {
              if (failing.has(platform)) throw new Error(`${platform} is down`);
              return { externalId: `${platform}-1`, url: `https://example.com/${platform}` };
            });
            results.push({ platform, ok: true as const, outcome });
          } catch (err) {
            results.push({ platform, ok: false as const, error: (err as Error).message });
          }
        }
        return results;
      },
      alert: async (m) => void alerts.push(m),
      log: () => {},
      ...overrides,
    };
  }

  before(async () => {
    const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
    await db().query(schema);
    await db().query(schema); // migrations must be safe to rerun
  });
  beforeEach(async () => {
    await db().query("TRUNCATE videos, agent_state CASCADE");
    failing = new Set();
    publishCalls = [];
    alerts = [];
  });
  after(() => closeDb());

  test("plans one idea per free slot and refills rejected slots", async () => {
    const d = deps();
    assert.equal(await planAhead(d, now), 3); // 15:00 on the 22nd, 23rd, 24th
    assert.equal(await planAhead(d, now), 0);
    const [first] = await store.listVideos(["idea"]);
    assert.equal(first.publish_at?.toISOString(), "2026-10-22T15:00:00.000Z");
    assert.ok(await store.reject(first.id, "not for us"));
    assert.equal(await planAhead(d, now), 1);
  });

  test("makes due videos, waits for approval, then posts to every platform", async () => {
    const d = deps({ planner: undefined });
    await store.insertIdeas([{ topic: "octopus hearts", angle: "", publishAt: new Date("2026-10-22T15:00:00Z"), platforms: settings.platforms }]);

    const r1 = await tick(d, now);
    assert.equal(r1.rendered.length, 1);
    const [video] = await store.listVideos(["rendered"]);
    assert.equal(video.title, "Title for octopus hearts");

    // Not approved yet: nothing is posted even after the slot passes.
    await tick(d, new Date("2026-10-22T16:00:00Z"));
    assert.equal(publishCalls.length, 0);

    assert.ok(await store.approve(video.id, { title: "Edited title", description: "d", hashtags: ["x"] }));
    const r2 = await tick(d, new Date("2026-10-22T16:00:00Z"));
    assert.deepEqual(r2.posted, [video.id]);
    assert.deepEqual(publishCalls, ["youtube", "instagram"]);
    assert.equal((await store.getVideo(video.id))?.status, "posted");
    assert.equal((await store.getVideo(video.id))?.title, "Edited title");
  });

  test("auto-approve posts without review", async () => {
    const d = deps({ planner: undefined, settings: { ...settings, autoApprove: true } });
    await store.insertIdeas([{ topic: "t", angle: "", publishAt: new Date("2026-10-22T13:00:00Z"), platforms: ["youtube"] }]);
    await tick(d, now);
    const r = await tick(d, new Date("2026-10-22T13:00:00Z"));
    assert.equal(r.posted.length, 1);
  });

  test("retries only the failing platform, then gives up after 3 tries and alerts", async () => {
    const d = deps({ planner: undefined, settings: { ...settings, autoApprove: true } });
    failing.add("instagram");
    await store.insertIdeas([{ topic: "t", angle: "", publishAt: now, platforms: settings.platforms }]);
    await tick(d, now); // make + first post attempt
    await tick(d, now); // attempt 2
    const r = await tick(d, now); // attempt 3
    assert.deepEqual(publishCalls, ["youtube", "instagram", "instagram", "instagram"]);
    assert.equal(r.failed.length, 1);
    const [video] = await store.listVideos(["failed"]);
    assert.match(video.error ?? "", /instagram/);
    assert.ok(alerts.some((a) => a.includes("Gave up")));

    // Retry from the review page re-arms it; with Instagram back up it finishes.
    failing.clear();
    assert.ok(await store.retry(video.id));
    await tick(d, now);
    assert.equal((await store.getVideo(video.id))?.status, "posted");
    assert.equal(publishCalls.filter((p) => p === "youtube").length, 1);
  });

  test("a failed render is marked failed with an alert", async () => {
    const d = deps({ planner: undefined, render: async () => { throw new Error("ElevenLabs returned 401"); } });
    await store.insertIdeas([{ topic: "t", angle: "", publishAt: now, platforms: ["youtube"] }]);
    await tick(d, now);
    const [video] = await store.listVideos(["failed"]);
    assert.match(video.error ?? "", /401/);
    assert.match(alerts[0], /Couldn't make/);
  });

  test("videos stuck mid-render are released", async () => {
    await store.insertIdeas([{ topic: "t", angle: "", publishAt: now, platforms: ["youtube"] }]);
    await store.claimIdeaToRender(now);
    await db().query("UPDATE videos SET updated_at = now() - interval '2 hours'");
    assert.equal(await store.releaseStuck(new Date(Date.now() - 3600_000)), 1);
    assert.equal((await store.listVideos(["idea"])).length, 1);
  });

  test("review page lists, approves, blocks cross-site posts and requires the password", async () => {
    await store.insertIdeas([{ topic: "cats", angle: "", publishAt: new Date("2026-10-22T15:00:00Z"), platforms: ["youtube"] }]);
    await tick(deps({ planner: undefined }), now);
    const [video] = await store.listVideos(["rendered"]);

    const server = await startReviewServer({ port: 0, password: "pw", host: "127.0.0.1" });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const auth = { authorization: `Basic ${Buffer.from("me:pw").toString("base64")}` };
    try {
      assert.equal((await fetch(base)).status, 401);
      const page = await (await fetch(base, { headers: auth })).text();
      assert.match(page, /Title for cats/);
      assert.match(page, new RegExp(`/videos/${video.id}/approve`));

      const form = new URLSearchParams({ title: "Cats <3", description: "d", hashtags: "#cats pets", publish_at: "2026-10-23T18:00" });
      const blocked = await fetch(`${base}/videos/${video.id}/approve`, { method: "POST", body: form, headers: { ...auth, origin: "https://evil.example" }, redirect: "manual" });
      assert.equal(blocked.status, 403);

      const ok = await fetch(`${base}/videos/${video.id}/approve`, { method: "POST", body: form, headers: auth, redirect: "manual" });
      assert.equal(ok.status, 303);
      const v = await store.getVideo(video.id);
      assert.equal(v?.status, "approved");
      assert.equal(v?.title, "Cats <3");
      assert.deepEqual(v?.hashtags, ["cats", "pets"]);
      assert.equal(v?.publish_at?.toISOString(), "2026-10-23T18:00:00.000Z");

      const after = await (await fetch(base, { headers: auth })).text();
      assert.match(after, /Cats &lt;3/);
      assert.doesNotMatch(after, /Cats <3/);
    } finally {
      server.close();
    }
  });

  // Posts one video to the given platforms as if it went out at `at`, with a render cost.
  async function postedVideo(title: string, at: Date, platforms: Platform[], costUsd = 0.05): Promise<string> {
    const { rows } = await db().query<{ id: string }>(
      "INSERT INTO videos (topic, title, status, publish_at, platforms, cost_usd) VALUES ($1, $1, 'posted', $2, $3, $4) RETURNING id",
      [title, at, platforms, costUsd],
    );
    for (const p of platforms) {
      await db().query("INSERT INTO posts (video_id, platform, status, external_id, url, published_at) VALUES ($1, $2, 'published', $3, $4, $5)", [
        rows[0].id, p, `${p}-${title}`, `https://example.com/${p}/${title}`, at,
      ]);
    }
    return rows[0].id;
  }

  const fakeFetchers = (views: Record<string, number>) => ({
    youtube: async (ids: string[]) => new Map(ids.map((id) => [id, { views: views[id] ?? 0, likes: 1 }])),
    facebook: async (id: string) => ({ views: views[id] ?? 0 }),
    instagram: async (id: string) => {
      if (!(id in views)) throw new Error("token expired");
      return { views: views[id], watchTimeSec: 30 };
    },
  });

  test("collects a snapshot per live post, survives one platform failing, and skips old posts", async () => {
    await postedVideo("fresh", new Date("2026-10-20T15:00:00Z"), ["youtube", "facebook", "instagram"]);
    await postedVideo("old", new Date("2026-08-01T15:00:00Z"), ["youtube"]);
    const r = await collectStats(now, fakeFetchers({ "youtube-fresh": 100, "facebook-fresh": 20 }));
    assert.equal(r.saved, 2);
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /instagram.*token expired/);

    // A second snapshot later; pastVideos and the report use the latest one per post, summed across platforms.
    await collectStats(new Date("2026-10-22T18:00:00Z"), fakeFetchers({ "youtube-fresh": 250, "facebook-fresh": 30, "instagram-fresh": 70 }));
    const past = await store.pastVideos();
    assert.equal(past.find((p) => p.title === "fresh")?.views, 350);
    assert.equal(past.find((p) => p.title === "old")?.views, null);
  });

  test("weekly report ranks videos and works out cost per 1,000 views", async () => {
    const at = new Date("2026-10-20T15:00:00Z");
    await postedVideo("big", at, ["youtube", "instagram"], 0.1);
    await postedVideo("small", at, ["youtube"], 0.1);
    await postedVideo("last month", new Date("2026-09-01T15:00:00Z"), ["youtube"], 5);
    await collectStats(now, fakeFetchers({ "youtube-big": 1500, "instagram-big": 500, "youtube-small": 0, "youtube-last month": 9 }));
    await store.insertIdeas([{ topic: "next idea", angle: "", publishAt: new Date("2026-10-23T15:00:00Z"), platforms: ["youtube"] }]);

    const r = await buildReport(now);
    assert.deepEqual(r.videos.map((v) => [v.title, v.views]), [["big", 2000], ["small", 0]]);
    assert.equal(r.totals.views, 2000);
    assert.equal(r.byPlatform.instagram?.watchTimeSec, 30);
    assert.ok(Math.abs(r.totals.costUsd - 0.2) < 1e-9);
    assert.ok(Math.abs((r.totals.costPer1kViews ?? 0) - 0.1) < 1e-9);
    assert.equal(r.upcoming[0].title, "next idea");
    const text = reportText(r);
    assert.match(text, /2 video\(s\) posted · 2,000 views/);
    assert.match(text, /Next up: next idea/);
  });

  test("the agent collects stats every few hours and sends the report once on Mondays", async () => {
    let collected = 0;
    let reports = 0;
    const d = deps({
      planner: undefined,
      analytics: {
        collect: async () => (collected++, { saved: 0, errors: [] }),
        report: async () => void reports++,
      },
    });
    const monday = new Date("2026-10-26T08:00:00Z");
    await tick(d, monday);
    await tick(d, new Date("2026-10-26T09:30:00Z")); // < 6 hours later: no new stats, but report time
    await tick(d, new Date("2026-10-26T14:30:00Z")); // 6.5 hours after the first: stats again; report already sent
    await tick(d, new Date("2026-10-27T10:00:00Z")); // Tuesday
    assert.equal(collected, 3);
    assert.equal(reports, 1);
  });

  test("review page shows the weekly report", async () => {
    await postedVideo("Report <video>", new Date("2026-10-20T15:00:00Z"), ["youtube"]);
    const server = await startReviewServer({ port: 0, host: "127.0.0.1" });
    try {
      const html = await (await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/report`)).text();
      assert.match(html, /Report &lt;video&gt;/);
      assert.match(html, /videos posted/);
    } finally {
      server.close();
    }
  });

  test("comments get drafted replies that only post when approved, once", async () => {
    await postedVideo("octopus", new Date("2026-10-20T15:00:00Z"), ["youtube", "instagram"]);
    const replies: [string, string, string][] = [];
    let igDown = true;
    const platforms = {
      fetch: async (platform: Platform) =>
        platform === "youtube"
          ? [
              { externalId: "yc1", author: "Ana", text: "Do they really have blue blood?" },
              { externalId: "yc2", author: "bot", text: "WIN A FREE PHONE at scam.example" },
            ]
          : [{ externalId: "ic1", author: "sam", text: "wow" }],
      reply: async (platform: Platform, id: string, text: string) => {
        if (platform === "instagram" && igDown) throw new Error("token expired");
        replies.push([platform, id, text]);
        return `r-${id}`;
      },
    };
    const seen: string[] = [];
    const drafter = async ({ video, comments: cs }: { video: { title: string }; comments: { id: string; text: string }[] }) => {
      seen.push(video.title);
      return new Map(cs.map((c) => [c.id, c.text.includes("scam") ? "" : `Thanks! (${c.text.length})`]));
    };

    const r = await comments.checkComments(now, platforms, drafter);
    assert.deepEqual([r.found, r.drafted, r.skipped], [3, 2, 1]);
    assert.deepEqual(seen, ["octopus"]); // one Claude call per video
    assert.equal((await comments.checkComments(now, platforms, drafter)).found, 0); // no duplicates

    const pending = await comments.pendingReplies();
    assert.equal(pending.length, 2);
    assert.equal(replies.length, 0); // nothing posted without approval

    const yt = pending.find((c) => c.platform === "youtube")!;
    assert.deepEqual(await comments.sendReply(yt.id, "  Yes, copper makes it blue!  ", platforms), { ok: true, message: "Reply posted on youtube." });
    assert.deepEqual(replies, [["youtube", "yc1", "Yes, copper makes it blue!"]]);
    assert.equal((await comments.sendReply(yt.id, "again", platforms)).ok, false); // a second click doesn't post twice

    const ig = pending.find((c) => c.platform === "instagram")!;
    const failed = await comments.sendReply(ig.id, "Thanks!", platforms);
    assert.match(failed.message, /token expired/);
    assert.equal((await comments.pendingReplies())[0].status, "failed");
    igDown = false;
    assert.ok((await comments.sendReply(ig.id, "Thanks!", platforms)).ok);
    assert.equal((await comments.pendingReplies()).length, 0);
  });

  test("review page sends and ignores comment replies", async () => {
    await postedVideo("cats", new Date("2026-10-20T15:00:00Z"), ["youtube"]);
    const sent: string[] = [];
    const platforms = {
      fetch: async () => [
        { externalId: "a", author: "<b>x</b>", text: "Love it <script>" },
        { externalId: "b", author: "y", text: "first" },
      ],
      reply: async (_p: Platform, id: string, text: string) => (sent.push(`${id}:${text}`), "r1"),
    };
    await comments.checkComments(now, platforms, async ({ comments: cs }) => new Map(cs.map((c) => [c.id, "Thank you!"])));
    const [a, b] = (await comments.pendingReplies()).sort((x, y) => x.external_id.localeCompare(y.external_id));

    const server = await startReviewServer({ port: 0, host: "127.0.0.1", commentPlatforms: platforms });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const page = await (await fetch(base)).text();
      assert.match(page, /Comment replies/);
      assert.match(page, /Love it &lt;script&gt;/);
      assert.match(page, /2 comment replies to approve/);

      const send = await fetch(`${base}/comments/${a.id}/send`, { method: "POST", body: new URLSearchParams({ reply: "Edited thanks" }), redirect: "manual" });
      assert.equal(send.status, 303);
      assert.deepEqual(sent, ["a:Edited thanks"]);
      const ignore = await fetch(`${base}/comments/${b.id}/ignore`, { method: "POST", body: new URLSearchParams(), redirect: "manual" });
      assert.equal(ignore.status, 303);
      assert.equal(sent.length, 1);
      assert.equal((await comments.pendingReplies()).length, 0);
    } finally {
      server.close();
    }
  });

  test("long ideas are planned for YouTube only", async () => {
    const d = deps({ settings: { ...settings, format: "long", platforms: ["youtube", "instagram"] } });
    await planAhead(d, now);
    const ideas = await store.listVideos(["idea"]);
    assert.ok(ideas.length > 0);
    assert.ok(ideas.every((v) => v.format === "long" && v.platforms.join() === "youtube"));
  });

  test("db:migrate with DB_SCHEMA keeps a brand's tables in their own schema", async () => {
    const { execFileSync } = await import("node:child_process");
    await db().query("DROP SCHEMA IF EXISTS brand_test CASCADE");
    execFileSync("npx", ["tsx", "scripts/migrate.ts"], { env: { ...process.env, DATABASE_URL: url, DB_SCHEMA: "brand_test", BRAND: "" }, stdio: "pipe" });
    const { rows } = await db().query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'brand_test' ORDER BY table_name");
    assert.deepEqual(rows.map((r) => r.table_name), ["agent_state", "comments", "post_stats", "posts", "videos"]);
    await db().query("DROP SCHEMA brand_test CASCADE");
  });
});
