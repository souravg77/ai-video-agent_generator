// Runs one agent per brand file in brands/ (everything except example.env), side by side.
//   npm run agents
//   npm run agents -- cooking travel     (only these brands)
// Each brand gets its own review page port: REVIEW_PORT from its file, else 3001, 3002…
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import dotenv from "dotenv";

const all = existsSync("brands")
  ? readdirSync("brands").filter((f) => f.endsWith(".env") && f !== "example.env").map((f) => f.slice(0, -4)).sort()
  : [];
const wanted = process.argv.slice(2);
const brands = wanted.length ? wanted : all;
const missing = brands.filter((b) => !all.includes(b));
if (missing.length) {
  console.error(`No brands/${missing[0]}.env. Brands found: ${all.join(", ") || "none"}.`);
  process.exit(1);
}
if (!brands.length) {
  console.error("No brands yet. Copy brands/example.env to brands/<name>.env and fill it in.");
  process.exit(1);
}

const children: ChildProcess[] = [];
let stopping = false;
for (const [i, brand] of brands.entries()) {
  const own = dotenv.parse(readFileSync(`brands/${brand}.env`));
  const env = { ...process.env, BRAND: brand, ...(own.REVIEW_PORT ? {} : { REVIEW_PORT: String(3001 + i) }) };
  const child = spawn(process.execPath, ["--import", "tsx", "scripts/agent.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
  const prefix = (stream: NodeJS.WritableStream) => (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) if (line) stream.write(`[${brand}] ${line}\n`);
  };
  child.stdout!.on("data", prefix(process.stdout));
  child.stderr!.on("data", prefix(process.stderr));
  child.on("exit", (code) => {
    if (!stopping) console.error(`[${brand}] agent exited with code ${code}`);
  });
  children.push(child);
}
console.log(`Running ${brands.length} brand(s): ${brands.join(", ")}`);

const stop = () => {
  stopping = true;
  for (const c of children) c.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
