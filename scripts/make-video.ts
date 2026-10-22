// Turns a topic into a finished MP4.
//   npm run make -- --topic "why octopuses have three hearts"
//   npm run make -- --topic "test" --offline     (no API keys needed)
//   npm run make -- --topic "..." --long         (4-8 minute 16:9 YouTube video)
//   npm run make -- --topic "..." --language Spanish
//   npm run make -- --translate out/<run> --language Spanish   (same footage, new script and voice)
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { config } from "../src/config.js";
import { closeDb } from "../src/lib/db.js";
import { makeVideo } from "../src/pipeline/index.js";

const { values } = parseArgs({
  options: {
    topic: { type: "string", short: "t" },
    offline: { type: "boolean", default: false },
    out: { type: "string" },
    music: { type: "string" },
    "no-upload": { type: "boolean", default: false },
    long: { type: "boolean", default: false },
    language: { type: "string" },
    translate: { type: "string" },
  },
});

if (values.translate && !values.language) {
  console.error("--translate needs --language, e.g. --language Spanish");
  process.exit(1);
}
const topic = values.topic ?? (values.translate ? basename(values.translate).replace(/^[\d-]+T[\d-]+-/, "") : undefined);
if (!topic) {
  console.error('Usage: npm run make -- --topic "your topic" [--long] [--language Spanish] [--offline] [--music track.mp3] [--out dir] [--no-upload]');
  console.error("       npm run make -- --translate out/<run> --language Spanish");
  process.exit(1);
}

try {
  const result = await makeVideo({
    topic,
    format: values.long ? "long" : undefined,
    language: values.language,
    translateFrom: values.translate,
    offline: values.offline,
    outDir: values.out ?? config.OUT_DIR,
    musicPath: values.music,
    upload: !values["no-upload"],
    log: (m) => console.log(m),
  });
  console.log(`\nDone: ${result.videoPath} (${result.durationSec.toFixed(1)} s, about $${result.costUsd.toFixed(3)})`);
  console.log(`Title: ${result.script.title}`);
  if (result.url) console.log(`Uploaded: ${result.url}`);
  if (result.videoId) console.log(`Database id: ${result.videoId}`);
} catch (err) {
  console.error(`\nFailed: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
