// Reports which integrations are configured and, where possible, whether the credentials work.
// In local mode (AGENT_MODE=local, or any of the *_PROVIDER / PUBLISH_MODE settings) it checks the local tools instead.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { google } from "googleapis";
import pg from "pg";
import { config, requirements } from "../src/config.js";
import { parsePlatforms } from "../src/publish/index.js";
import { graphGet } from "../src/lib/graph.js";

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

// Services the chosen providers replace aren't needed.
const replaced = new Set<string>([
  ...(config.LLM_PROVIDER === "ollama" ? ["Claude API"] : []),
  ...(config.TTS_PROVIDER === "piper" ? ["Voice (ElevenLabs)"] : []),
  ...(config.VISUALS_PROVIDER !== "pexels" ? ["Stock footage (Pexels)"] : []),
  ...(config.PUBLISH_MODE === "manual" ? ["Storage (R2)", "YouTube", "Facebook Page", "Instagram"] : []),
]);
// Platforms you don't post to aren't needed either; R2 is only for Instagram.
const platforms = parsePlatforms(config.AGENT_PLATFORMS);
if (!platforms.includes("youtube")) replaced.add("YouTube");
if (!platforms.includes("facebook")) replaced.add("Facebook Page");
if (!platforms.includes("instagram")) ["Instagram", "Storage (R2)"].forEach((n) => replaced.add(n));

console.log(`Mode: writing ${config.LLM_PROVIDER}, voice ${config.TTS_PROVIDER}, footage ${config.VISUALS_PROVIDER}, posting ${config.PUBLISH_MODE}\n`);

for (const [name, keys] of Object.entries(requirements)) {
  if (replaced.has(name)) continue;
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

if (config.LLM_PROVIDER === "ollama") {
  const r: Result = { name: "Ollama", ok: false, detail: "" };
  results.push(r);
  try {
    const res = await fetch(`${config.OLLAMA_URL}/api/tags`);
    const { models } = (await res.json()) as { models: { name: string }[] };
    const want = config.OLLAMA_MODEL.includes(":") ? config.OLLAMA_MODEL : `${config.OLLAMA_MODEL}:latest`;
    r.ok = models.some((m) => m.name === want);
    r.detail = r.ok ? `${config.OLLAMA_MODEL} ready` : `${config.OLLAMA_MODEL} not downloaded; run \`ollama pull ${config.OLLAMA_MODEL}\``;
  } catch {
    r.detail = `not reachable at ${config.OLLAMA_URL}; install it from ollama.com and run \`ollama serve\``;
  }
}

if (config.TTS_PROVIDER === "piper") {
  const bin = spawnSync(config.PIPER_PATH, ["--help"], { stdio: "ignore" });
  const voice = existsSync(config.PIPER_VOICE);
  const ok = bin.status === 0 && voice;
  const detail = bin.status !== 0 ? `${config.PIPER_PATH} not found; run \`npm run local:setup\`` : voice ? `voice ${config.PIPER_VOICE}` : `voice ${config.PIPER_VOICE} missing; run \`npm run local:setup\``;
  results.push({ name: "Piper voice", ok, detail });
}

if (config.VISUALS_PROVIDER === "folder") {
  const clips = existsSync(config.FOOTAGE_DIR) ? readdirSync(config.FOOTAGE_DIR, { recursive: true }).map(String).filter((f) => /\.(mp4|mov|m4v|webm|mkv)$/i.test(f)).length : 0;
  results.push({ name: "Footage folder", ok: clips > 0, detail: clips ? `${clips} clip(s) in ${config.FOOTAGE_DIR}/` : `no clips in ${config.FOOTAGE_DIR}/` });
}

if (config.PUBLISH_MODE === "manual") results.push({ name: "Posting", ok: true, detail: `manual: videos are exported to ${config.OUT_DIR}/ready/ for you to upload` });

const optional = (r: Result) => r.name.includes("(optional)");
for (const r of results) console.log(`${r.ok ? "✓" : optional(r) ? "·" : "✗"} ${r.name.padEnd(14)} ${r.detail}`);
process.exitCode = results.every((r) => r.ok || optional(r)) ? 0 : 1;
