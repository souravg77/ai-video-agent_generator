// Prints the weekly report: what was posted, views per platform, best and worst videos, spend.
//   npm run report                (last 7 days)
//   npm run report -- --days 30
//   npm run report -- --send      (also posts it to ALERT_WEBHOOK_URL)
import { parseArgs } from "node:util";
import { sendWebhook } from "../src/agent/alerts.js";
import { buildReport, reportText } from "../src/analytics/report.js";
import { closeDb, dbConfigured } from "../src/lib/db.js";

const { values } = parseArgs({ options: { days: { type: "string", default: "7" }, send: { type: "boolean", default: false } } });

if (!dbConfigured()) {
  console.error("The report reads from Postgres. Set DATABASE_URL and run `npm run db:migrate` first.");
  process.exit(1);
}
try {
  const text = reportText(await buildReport(new Date(), Number(values.days)));
  console.log(text);
  if (values.send) console.log((await sendWebhook(text)) ? "\nSent to the webhook." : "\nNot sent: set ALERT_WEBHOOK_URL.");
} finally {
  await closeDb();
}
