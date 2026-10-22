// Adds your own idea to the agent's calendar.
//   npm run agent:add -- --topic "why cats purr" --at 2026-11-01T15:00:00Z [--angle "..."] [--to youtube,instagram] [--long]
import { parseArgs } from "node:util";
import { config } from "../src/config.js";
import { insertIdeas, platformsFor } from "../src/agent/store.js";
import { closeDb, dbConfigured } from "../src/lib/db.js";
import { parsePlatforms } from "../src/publish/index.js";

const { values } = parseArgs({
  options: { topic: { type: "string" }, angle: { type: "string", default: "" }, at: { type: "string" }, to: { type: "string" }, long: { type: "boolean", default: false } },
});

try {
  if (!dbConfigured()) throw new Error("Set DATABASE_URL and run `npm run db:migrate` first.");
  if (!values.topic || !values.at) throw new Error('Usage: npm run agent:add -- --topic "..." --at 2026-11-01T15:00:00Z');
  const publishAt = new Date(values.at);
  if (Number.isNaN(publishAt.getTime())) throw new Error("--at must be a date and time, e.g. 2026-11-01T15:00:00Z.");
  const platforms = parsePlatforms(values.to ?? config.AGENT_PLATFORMS);
  const format = values.long ? "long" : config.VIDEO_FORMAT;
  await insertIdeas([{ topic: values.topic, angle: values.angle, publishAt, platforms, format }]);
  console.log(`Added ${format === "long" ? "long video" : "short"} "${values.topic}" for ${publishAt.toISOString()} → ${platformsFor(format, platforms).join(", ")}`);
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
