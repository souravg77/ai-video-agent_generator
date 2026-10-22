// Turns a topic into a finished vertical MP4.
//   npm run make -- --topic "why octopuses have three hearts"
//   npm run make -- --topic "test" --offline     (no API keys needed)
import { parseArgs } from "node:util";
import { closeDb } from "../src/lib/db.js";
import { makeVideo } from "../src/pipeline/index.js";

const { values } = parseArgs({
  options: {
    topic: { type: "string", short: "t" },
    offline: { type: "boolean", default: false },
    out: { type: "string", default: "out" },
    music: { type: "string" },
    "no-upload": { type: "boolean", default: false },
  },
});

if (!values.topic) {
  console.error('Usage: npm run make -- --topic "your topic" [--offline] [--music track.mp3] [--out dir] [--no-upload]');
  process.exit(1);
}

try {
  const result = await makeVideo({
    topic: values.topic,
    offline: values.offline,
    outDir: values.out,
    musicPath: values.music,
    upload: !values["no-upload"],
    log: (m) => console.log(m),
  });
  console.log(`\nDone: ${result.videoPath} (${result.durationSec.toFixed(1)} s)`);
  console.log(`Title: ${result.script.title}`);
  if (result.url) console.log(`Uploaded: ${result.url}`);
  if (result.videoId) console.log(`Database id: ${result.videoId}`);
} catch (err) {
  console.error(`\nFailed: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
