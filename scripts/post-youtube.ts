// Uploads a video made by `npm run make` to YouTube.
//   npm run post:youtube                               (newest video in out/, private)
//   npm run post:youtube -- --dir out/<folder> --privacy public
//   npm run post:youtube -- --publish-at 2026-11-01T15:00:00Z
//   npm run post:youtube -- --dry-run                  (show what would be sent)
import { parseArgs } from "node:util";
import { closeDb } from "../src/lib/db.js";
import type { Privacy } from "../src/lib/youtube.js";
import { loadRun } from "../src/publish/run-dir.js";
import { postToYouTube } from "../src/publish/youtube.js";

const { values } = parseArgs({
  options: {
    dir: { type: "string" },
    privacy: { type: "string", default: "private" },
    "publish-at": { type: "string" },
    synthetic: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

const privacy = values.privacy as Privacy;
if (!["private", "unlisted", "public"].includes(privacy)) {
  console.error("--privacy must be private, unlisted or public.");
  process.exit(1);
}
const publishAt = values["publish-at"] ? new Date(values["publish-at"]) : undefined;
if (publishAt && Number.isNaN(publishAt.getTime())) {
  console.error("--publish-at must be a date and time, e.g. 2026-11-01T15:00:00Z.");
  process.exit(1);
}

try {
  const run = await loadRun(values.dir);
  console.log(`Video: ${run.videoPath}`);
  const { metadata, upload } = await postToYouTube(run, {
    privacy,
    publishAt,
    containsSyntheticMedia: values.synthetic,
    dryRun: values["dry-run"],
    log: (m) => console.log(m),
  });

  if (!upload) {
    console.log("\nDry run. This is what would be sent to YouTube:\n");
    console.log(JSON.stringify(metadata, null, 2));
  } else {
    console.log(`\nUploaded: ${upload.url}`);
    console.log(upload.publishAt ? `Scheduled to go public at ${upload.publishAt}` : `Visibility: ${upload.privacyStatus}`);
    if (privacy !== "private" && upload.privacyStatus === "private" && !upload.publishAt) {
      console.log("YouTube kept it private. Until your API project passes YouTube's audit, API uploads stay private; make it public in YouTube Studio.");
    }
  }
} catch (err) {
  console.error(`\nFailed: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
