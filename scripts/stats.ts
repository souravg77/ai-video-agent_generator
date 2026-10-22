// Takes one snapshot of views, likes, comments and watch time for posts from the last 30 days.
//   npm run stats
// The agent does this on its own every AGENT_STATS_HOURS; this is for cron setups or a quick check.
import { collectStats, defaultFetchers } from "../src/analytics/collect.js";
import { closeDb, dbConfigured } from "../src/lib/db.js";

if (!dbConfigured()) {
  console.error("Stats are stored in Postgres. Set DATABASE_URL and run `npm run db:migrate` first.");
  process.exit(1);
}
try {
  const now = new Date();
  const r = await collectStats(now, defaultFetchers(now, (m) => console.log(m)));
  console.log(`Saved ${r.saved} snapshot(s).`);
  for (const e of r.errors) console.error(`  ${e}`);
  if (r.errors.length) process.exitCode = 1;
} finally {
  await closeDb();
}
