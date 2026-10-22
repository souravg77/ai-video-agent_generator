// Runs the agent: plans ideas, makes videos, waits for approval on the review page, posts on schedule.
//   npm run agent                 (runs until stopped; review page on http://localhost:3000)
//   npm run agent -- --once       (one pass, for cron)
//   npm run agent -- --offline    (sample ideas and offline renders; still needs DATABASE_URL)
import { parseArgs } from "node:util";
import { config } from "../src/config.js";
import { defaultDeps, tick } from "../src/agent/worker.js";
import { closeDb, dbConfigured } from "../src/lib/db.js";
import { startReviewServer } from "../src/review/server.js";

const { values } = parseArgs({
  options: {
    once: { type: "boolean", default: false },
    offline: { type: "boolean", default: false },
    "no-review": { type: "boolean", default: false },
  },
});

if (!dbConfigured()) {
  console.error("The agent keeps its calendar in Postgres. Set DATABASE_URL and run `npm run db:migrate` first.");
  process.exit(1);
}

const deps = defaultDeps({ offline: values.offline });
if (!deps.planner) console.log("AGENT_NICHE is not set, so the agent won't plan ideas. Add ideas with `npm run agent:add`.");
console.log(`Posting slots (UTC): ${deps.settings.postTimesUtc} · platforms: ${deps.settings.platforms.join(", ")} · ${deps.settings.autoApprove ? "auto-approve ON" : "approval required"}`);

async function runOnce() {
  const r = await tick(deps);
  if (r.planned || r.rendered.length || r.posted.length || r.failed.length || r.released) {
    deps.log(`planned ${r.planned}, made ${r.rendered.length}, posted ${r.posted.length}, failed ${r.failed.length}${r.released ? `, unstuck ${r.released}` : ""}`);
  }
  const extra = [r.statsSaved != null && `saved ${r.statsSaved} stats snapshot(s)`, r.reportSent && "sent the weekly report"].filter(Boolean);
  if (extra.length) deps.log(extra.join(", "));
}

if (values.once) {
  try {
    await runOnce();
  } finally {
    await closeDb();
  }
} else {
  if (!values["no-review"]) {
    await startReviewServer({ port: config.REVIEW_PORT, password: config.REVIEW_PASSWORD });
    console.log(`Review page: http://localhost:${config.REVIEW_PORT}${config.REVIEW_PASSWORD ? " (password protected)" : " (this computer only; set REVIEW_PASSWORD to open it to your network)"}`);
  }
  let running = false;
  let stopping = false;
  const loop = async () => {
    if (running || stopping) return;
    running = true;
    try {
      await runOnce();
    } catch (err) {
      await deps.alert(`Agent tick crashed: ${(err as Error).message}`);
    } finally {
      running = false;
    }
  };
  await loop();
  const timer = setInterval(loop, config.AGENT_TICK_SECONDS * 1000);
  const stop = async () => {
    stopping = true;
    clearInterval(timer);
    console.log("Stopping…");
    while (running) await new Promise((r) => setTimeout(r, 500));
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
