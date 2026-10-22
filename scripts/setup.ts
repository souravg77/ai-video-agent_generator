// Guided setup: for each step, pick a free local tool or connect an API, enter the keys, and sign in.
//   npm run setup                 (writes .env, or brands/<BRAND>.env with BRAND=…)
// Run it again any time to switch a step between local and an API.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { envFile } from "../src/config.js";
import { writeEnv } from "../src/lib/env-file.js";
import type { Platform } from "../src/lib/db.js";
import { envForChoices, keysToAsk, STEP_OPTIONS, type SetupChoices } from "../src/lib/setup-choices.js";
import { parsePlatforms } from "../src/publish/index.js";

if (!process.stdin.isTTY) {
  console.error("npm run setup asks questions, so run it in a terminal. To set things by hand, edit .env (see .env.example).");
  process.exit(1);
}

// Typed secrets aren't echoed.
let muted = false;
const output = new Writable({ write: (chunk, _enc, done) => void (muted ? done() : process.stdout.write(chunk, done)) });
const rl = createInterface({ input: process.stdin, output, terminal: true });
const current = existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, "utf8").split("\n").map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter((m) => m && m[2]).map((m) => [m![1], m![2]])) : {};

async function pick<T extends string>(title: string, options: readonly { value: T; label: string; needs: string }[], fallback: string | undefined): Promise<T> {
  console.log(`\n${title}`);
  options.forEach((o, i) => console.log(`  ${i + 1}. ${o.label}\n     needs: ${o.needs}`));
  const def = Math.max(0, options.findIndex((o) => o.value === fallback)) + 1;
  for (;;) {
    const n = Number((await rl.question(`Choose 1-${options.length} [${def}]: `)).trim() || def);
    if (options[n - 1]) return options[n - 1].value;
  }
}

async function ask(key: string, hint: string, secret: boolean): Promise<string | undefined> {
  const have = current[key] ? " (already set; Enter keeps it)" : "";
  process.stdout.write(`${key}: ${hint}${have}\n> `);
  muted = secret;
  const value = (await rl.question("")).trim();
  muted = false;
  if (secret) process.stdout.write("\n");
  return value || undefined;
}

const choices: SetupChoices = {
  writing: await pick("1/4 Writing scripts and ideas", STEP_OPTIONS.writing, current.LLM_PROVIDER ?? (current.AGENT_MODE === "local" ? "ollama" : undefined)),
  voice: await pick("2/4 Voice-over", STEP_OPTIONS.voice, current.TTS_PROVIDER ?? (current.AGENT_MODE === "local" ? "piper" : undefined)),
  footage: await pick("3/4 Background footage", STEP_OPTIONS.footage, current.VISUALS_PROVIDER ?? (current.AGENT_MODE === "local" ? "generated" : undefined)),
  posting: await pick("4/4 Posting", STEP_OPTIONS.posting, current.PUBLISH_MODE ?? (current.AGENT_MODE === "local" ? "manual" : undefined)),
  platforms: [],
};
for (;;) {
  const answer = (await rl.question(`\nPlatforms (youtube,facebook,instagram) [${current.AGENT_PLATFORMS ?? "youtube,facebook,instagram"}]: `)).trim();
  try {
    choices.platforms = parsePlatforms(answer || current.AGENT_PLATFORMS || "youtube,facebook,instagram") as Platform[];
    if (choices.platforms.length) break;
  } catch (err) {
    console.log((err as Error).message);
  }
}

const values = envForChoices(choices);
const keys = keysToAsk(choices);
if (keys.length) console.log(`\nKeys for the APIs you picked. Paste each one; secrets aren't shown as you type.`);
for (const k of keys) {
  const v = await ask(k.key, k.hint, k.secret);
  if (v) values[k.key] = v;
}
const niche = (await rl.question(`\nWhat is the channel about? (AGENT_NICHE)${current.AGENT_NICHE ? ` [${current.AGENT_NICHE}]` : ""}: `)).trim();
if (niche) values.AGENT_NICHE = niche;
rl.close();

writeEnv(values);
console.log(`\nSaved your choices to ${envFile}.`);

const run = (script: string, ...args: string[]) => spawnSync("npm", ["run", "--silent", script, ...(args.length ? ["--", ...args] : [])], { stdio: "inherit" }).status === 0;
const has = (key: string) => Boolean(values[key] ?? current[key]);

if (choices.writing === "ollama" || choices.voice === "piper" || choices.footage === "folder") {
  console.log("\nSetting up the local tools…");
  run("local:setup", "--no-env");
}
if (choices.posting === "api" && choices.platforms.includes("youtube") && has("GOOGLE_CLIENT_ID") && has("GOOGLE_CLIENT_SECRET") && (values.GOOGLE_CLIENT_ID || values.GOOGLE_CLIENT_SECRET || !current.YOUTUBE_REFRESH_TOKEN)) {
  console.log("\nSigning in to YouTube…");
  run("auth:youtube");
}
if (choices.posting === "api" && choices.platforms.some((p) => p !== "youtube") && values.META_SHORT_LIVED_USER_TOKEN) {
  console.log("\nConnecting your Facebook Page and Instagram…");
  run("auth:meta");
}

console.log("\nChecking everything:");
run("check");
console.log(`
Next:
  npm run make -- --topic "why octopuses have three hearts"    make one video
  npm run db:migrate && npm run agent                          run the agent (needs DATABASE_URL)
Run npm run setup again any time to switch a step between local and an API.`);
