// Reports which integrations are configured and, where possible, whether the credentials work.
import { google } from "googleapis";
import pg from "pg";
import { config, requirements } from "../src/config.js";
import { graphGet } from "../src/lib/graph.js";

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

for (const [name, keys] of Object.entries(requirements)) {
  const missing = keys.filter((k) => !config[k]);
  results.push({ name, ok: missing.length === 0, detail: missing.length ? `missing ${missing.join(", ")}` : "configured" });
}

async function probe(name: string, fn: () => Promise<string>) {
  const r = results.find((x) => x.name === name);
  if (!r?.ok) return;
  try {
    r.detail = await fn();
  } catch (err) {
    r.ok = false;
    r.detail = (err as Error).message;
  }
}

await probe("Database", async () => {
  const client = new pg.Client({ connectionString: config.DATABASE_URL });
  await client.connect();
  await client.query("select 1");
  await client.end();
  return "connected";
});

await probe("YouTube", async () => {
  const auth = new google.auth.OAuth2(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: config.YOUTUBE_REFRESH_TOKEN });
  const yt = google.youtube({ version: "v3", auth });
  const res = await yt.channels.list({ part: ["snippet"], mine: true });
  return `channel "${res.data.items?.[0]?.snippet?.title ?? "?"}"`;
});

await probe("Facebook Page", async () => {
  const page = await graphGet<{ name: string }>(config.META_PAGE_ID!, { access_token: config.META_PAGE_ACCESS_TOKEN!, fields: "name" });
  return `page "${page.name}"`;
});

await probe("Instagram", async () => {
  const ig = await graphGet<{ username: string }>(config.META_IG_USER_ID!, { access_token: config.META_PAGE_ACCESS_TOKEN!, fields: "username" });
  return `@${ig.username}`;
});

for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name.padEnd(14)} ${r.detail}`);
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
