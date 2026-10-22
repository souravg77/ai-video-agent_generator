// Posts a video made by `npm run make` to one or more platforms.
//   npm run post                                        (newest video, all platforms)
//   npm run post -- --to youtube,facebook --dir out/<folder>
//   npm run post -- --to youtube,facebook --schedule 2026-11-01T15:00:00Z
import { parseArgs } from "node:util";
import { closeDb } from "../src/lib/db.js";
import type { Privacy } from "../src/lib/youtube.js";
import { parsePlatforms, publish } from "../src/publish/index.js";
import { loadRun } from "../src/publish/run-dir.js";

const { values } = parseArgs({
  options: {
    to: { type: "string", default: "youtube,facebook,instagram" },
    dir: { type: "string" },
    privacy: { type: "string", default: "public" },
    schedule: { type: "string" },
    synthetic: { type: "boolean", default: false },
  },
});

try {
  const platforms = parsePlatforms(values.to);
  const scheduleAt = values.schedule ? new Date(values.schedule) : undefined;
  if (scheduleAt && Number.isNaN(scheduleAt.getTime())) throw new Error("--schedule must be a date and time, e.g. 2026-11-01T15:00:00Z.");
  if (!["private", "unlisted", "public"].includes(values.privacy)) throw new Error("--privacy must be private, unlisted or public.");

  const run = await loadRun(values.dir);
  console.log(`Video: ${run.videoPath}`);
  const results = await publish(run, platforms, {
    privacy: values.privacy as Privacy,
    scheduleAt,
    containsSyntheticMedia: values.synthetic,
    log: (m) => console.log(m),
  });

  console.log("");
  for (const r of results) {
    if (r.ok) console.log(`✓ ${r.platform.padEnd(9)} ${r.outcome.url ?? r.outcome.externalId}${r.outcome.scheduledFor ? ` (scheduled ${r.outcome.scheduledFor})` : ""}`);
    else console.log(`✗ ${r.platform.padEnd(9)} ${r.error}`);
  }
  if (results.some((r) => !r.ok)) process.exitCode = 1;
} catch (err) {
  console.error(`\nFailed: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
