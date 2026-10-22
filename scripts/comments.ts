// Fetches new comments on recent posts and has Claude draft replies. Nothing is posted:
// approve, edit or ignore each draft on the review page.
//   npm run comments
// The agent does this on its own every AGENT_STATS_HOURS when AGENT_COMMENT_REPLIES=true.
import { checkComments } from "../src/comments/index.js";
import { aiDrafter } from "../src/comments/drafts.js";
import { realPlatforms } from "../src/comments/platforms.js";
import { closeDb, dbConfigured } from "../src/lib/db.js";

if (!dbConfigured()) {
  console.error("Comments are stored in Postgres. Set DATABASE_URL and run `npm run db:migrate` first.");
  process.exit(1);
}
try {
  const r = await checkComments(new Date(), realPlatforms, aiDrafter());
  console.log(`${r.found} new comment(s), ${r.drafted} reply draft(s), ${r.skipped} not worth a reply.`);
  for (const e of r.errors) console.error(`  ${e}`);
  if (r.drafted) console.log("Review the drafts on the review page (npm run agent).");
  if (r.errors.length) process.exitCode = 1;
} finally {
  await closeDb();
}
