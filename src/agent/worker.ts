import { config } from "../config.js";
import type { Platform } from "../lib/db.js";
import { makeVideo } from "../pipeline/index.js";
import { normalizeScript } from "../pipeline/script.js";
import { parsePlatforms, publish, type PlatformResult } from "../publish/index.js";
import type { RenderedRun } from "../publish/run-dir.js";
import { alert } from "./alerts.js";
import { claudePlanner, type Planner } from "./planner.js";
import { freeSlots, upcomingSlots } from "./slots.js";
import * as store from "./store.js";

export type AgentSettings = {
  postTimesUtc: string;
  planDays: number;
  renderLeadHours: number;
  autoApprove: boolean;
  platforms: Platform[];
};

export type AgentDeps = {
  settings: AgentSettings;
  planner?: Planner; // no planner: only manually added ideas get made
  render: (video: store.VideoRow) => Promise<void>;
  publish: (run: RenderedRun, platforms: Platform[]) => Promise<PlatformResult[]>;
  alert: (message: string) => Promise<void>;
  log: (message: string) => void;
};

export type TickReport = { planned: number; rendered: string[]; posted: string[]; failed: string[]; released: number };

const STUCK_AFTER_MS = 60 * 60_000;

export function settingsFromEnv(): AgentSettings {
  return {
    postTimesUtc: config.AGENT_POST_TIMES_UTC,
    planDays: config.AGENT_PLAN_DAYS,
    renderLeadHours: config.AGENT_RENDER_LEAD_HOURS,
    autoApprove: config.AGENT_AUTO_APPROVE,
    platforms: parsePlatforms(config.AGENT_PLATFORMS),
  };
}

export function defaultDeps(opts: { offline?: boolean } = {}): AgentDeps {
  const offlinePlanner: Planner = async (count) =>
    Array.from({ length: count }, (_, i) => ({ topic: `sample idea ${Date.now().toString(36)}-${i + 1}`, angle: "Offline placeholder idea" }));
  return {
    settings: settingsFromEnv(),
    planner: opts.offline ? offlinePlanner : config.AGENT_NICHE ? claudePlanner(config.AGENT_NICHE) : undefined,
    render: async (v) => {
      await makeVideo({ topic: v.topic, angle: v.angle ?? undefined, videoId: v.id, offline: opts.offline, log: () => {} });
    },
    publish: (run, platforms) => publish(run, platforms, { privacy: "public" }),
    alert,
    log: (m) => console.log(`[agent ${new Date().toISOString()}] ${m}`),
  };
}

// Builds what the publishers need from the database row, using any edits made on the review page.
export function runFromRow(v: store.VideoRow): RenderedRun {
  if (!v.local_dir || !v.script) throw new Error(`Video ${v.id} has no rendered files.`);
  const script = normalizeScript({
    ...v.script,
    title: v.title ?? v.script.title,
    description: v.description ?? v.script.description,
    hashtags: v.hashtags.length ? v.hashtags : v.script.hashtags,
  });
  return { dir: v.local_dir, videoPath: `${v.local_dir}/video.mp4`, script, videoId: v.id, url: v.public_url ?? undefined };
}

export async function planAhead(deps: AgentDeps, now: Date): Promise<number> {
  if (!deps.planner) return 0;
  const slots = freeSlots(upcomingSlots(now, deps.settings.planDays, deps.settings.postTimesUtc), await store.takenSlots(now));
  if (slots.length === 0) return 0;
  const ideas = await deps.planner(slots.length, await store.pastVideos());
  const planned = ideas.slice(0, slots.length).map((idea, i) => ({ ...idea, publishAt: slots[i], platforms: deps.settings.platforms }));
  await store.insertIdeas(planned);
  return planned.length;
}

async function renderNext(deps: AgentDeps, now: Date): Promise<string | undefined> {
  const video = await store.claimIdeaToRender(new Date(now.getTime() + deps.settings.renderLeadHours * 3600_000));
  if (!video) return undefined;
  deps.log(`Making "${video.topic}" for ${video.publish_at?.toISOString()}`);
  try {
    await deps.render(video);
    if (deps.settings.autoApprove) await store.setStatus(video.id, "approved");
    else await store.setStatus(video.id, "rendered");
    return video.id;
  } catch (err) {
    const message = (err as Error).message;
    await store.setStatus(video.id, "failed", message);
    await deps.alert(`Couldn't make "${video.topic}": ${message}`);
    return undefined;
  }
}

async function postOne(deps: AgentDeps, video: store.VideoRow): Promise<"posted" | "failed" | "retry"> {
  const done = (p?: store.PostRow) => p && (p.status === "published" || p.status === "scheduled");
  const before = await store.postsFor(video.id);
  const pending = video.platforms.filter((pl) => {
    const p = before.find((x) => x.platform === pl);
    return !done(p) && (p?.attempts ?? 0) < store.MAX_POST_ATTEMPTS;
  });

  if (pending.length) {
    deps.log(`Posting "${video.title ?? video.topic}" to ${pending.join(", ")}`);
    const results = await deps.publish(runFromRow(video), pending);
    for (const r of results) if (!r.ok) await deps.alert(`Posting "${video.title ?? video.topic}" to ${r.platform} failed: ${r.error}`);
  }

  const after = await store.postsFor(video.id);
  const states = video.platforms.map((pl) => after.find((p) => p.platform === pl));
  if (states.every(done)) {
    await store.setStatus(video.id, "posted");
    return "posted";
  }
  const retriable = states.some((p) => !done(p) && (p?.attempts ?? 0) < store.MAX_POST_ATTEMPTS);
  if (retriable) {
    await store.setStatus(video.id, "approved");
    return "retry";
  }
  const failed = video.platforms.filter((_, i) => !done(states[i]));
  await store.setStatus(video.id, "failed", `Gave up posting to ${failed.join(", ")} after ${store.MAX_POST_ATTEMPTS} tries.`);
  await deps.alert(`Gave up posting "${video.title ?? video.topic}" to ${failed.join(", ")}. Use Retry on the review page after fixing the cause.`);
  return "failed";
}

// One pass of the agent: free stuck jobs, top up the calendar, make one video, post everything that's due.
export async function tick(deps: AgentDeps, now = new Date()): Promise<TickReport> {
  const report: TickReport = { planned: 0, rendered: [], posted: [], failed: [], released: 0 };
  report.released = await store.releaseStuck(new Date(now.getTime() - STUCK_AFTER_MS));

  try {
    report.planned = await planAhead(deps, now);
    if (report.planned) deps.log(`Planned ${report.planned} new idea(s)`);
  } catch (err) {
    await deps.alert(`Planning failed: ${(err as Error).message}`);
  }

  const rendered = await renderNext(deps, now);
  if (rendered) report.rendered.push(rendered);

  // Post everything that's due; a video that needs a retry waits for the next tick.
  const seen: string[] = [];
  for (let video = await store.claimApprovedToPost(now); video; video = await store.claimApprovedToPost(now, seen)) {
    seen.push(video.id);
    try {
      const outcome = await postOne(deps, video);
      if (outcome === "posted") report.posted.push(video.id);
      if (outcome === "failed") report.failed.push(video.id);
    } catch (err) {
      await store.setStatus(video.id, "failed", (err as Error).message);
      await deps.alert(`Posting "${video.title ?? video.topic}" failed: ${(err as Error).message}`);
      report.failed.push(video.id);
    }
  }
  return report;
}
