import { createReadStream, existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { join, resolve, sep } from "node:path";
import { config } from "../config.js";
import { makeVideo } from "../pipeline/index.js";
import { writeEnv } from "../lib/env-file.js";
import { renderStudioPage, STUDIO_LOGO } from "./page.js";

// A tiny local web app that drives the make-a-video pipeline from a window, so
// Windows users never touch a console. No database is required: videos are
// written to OUT_DIR exactly as `npm run make` does, and played back from there.

export type StudioServerOptions = { port: number; host?: string };

type Job = {
  id: string;
  topic: string;
  status: "running" | "done" | "error";
  logs: string[];
  result?: { name: string; title: string; durationSec: number; costUsd: number };
  error?: string;
  listeners: Set<ServerResponse>;
};

const jobs = new Map<string, Job>();
const FOLDER = /^[A-Za-z0-9][A-Za-z0-9._-]*$/; // output folder names (no traversal)

function sse(res: ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function emit(job: Job, event: string, data: unknown) {
  for (const res of job.listeners) sse(res, event, data);
}

// When writing uses Ollama, make sure its server is running. The Windows
// installer bundles ollama.exe on PATH, so this starts it automatically and the
// user never runs `ollama serve`.
let ollamaStarting = false;
async function ollamaReachable(): Promise<boolean> {
  try {
    const r = await fetch(`${config.OLLAMA_URL.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(1000) });
    return r.ok;
  } catch {
    return false;
  }
}
async function ensureOllama(): Promise<void> {
  if (config.LLM_PROVIDER !== "ollama" || ollamaStarting) return;
  if (await ollamaReachable()) return;
  ollamaStarting = true;
  try {
    const child = spawn("ollama", ["serve"], { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", () => {}); // not installed / wrong OS — leave it to the readiness probe
    child.unref();
  } catch {
    return;
  }
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await ollamaReachable()) return;
  }
}

// Readiness of the configured providers. Local tools are actually probed (is
// Ollama running? is the model pulled? is Piper installed?) so the page can warn
// before a video is attempted, instead of failing halfway through.
type Probe = { ready: boolean; reason?: string; pullable?: boolean };

async function probeOllama(): Promise<Probe> {
  const base = config.OLLAMA_URL.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return { ready: false, reason: `Ollama returned ${res.status} at ${config.OLLAMA_URL}.` };
    const data = (await res.json()) as { models?: { name: string }[] };
    const want = config.OLLAMA_MODEL.includes(":") ? config.OLLAMA_MODEL : `${config.OLLAMA_MODEL}:latest`;
    if (!(data.models ?? []).some((m) => m.name === want))
      return { ready: false, pullable: true, reason: `The writing model ${config.OLLAMA_MODEL} isn't downloaded yet.` };
    return { ready: true };
  } catch {
    return { ready: false, reason: `Ollama isn't running at ${config.OLLAMA_URL}. It starts with the app — give it a moment and press Re-check, or start it with \`ollama serve\`.` };
  }
}

async function probeOpenaiServer(): Promise<Probe> {
  const base = config.OPENAI_BASE_URL.replace(/\/$/, "");
  try {
    // Any HTTP reply (even 401) means the server is reachable.
    await fetch(`${base}/models`, { signal: AbortSignal.timeout(1500), headers: config.OPENAI_API_KEY ? { authorization: `Bearer ${config.OPENAI_API_KEY}` } : {} });
    return { ready: true };
  } catch {
    return { ready: false, reason: `The model server isn't reachable at ${config.OPENAI_BASE_URL}.` };
  }
}

function probePiper(): Probe {
  if (!existsSync(config.PIPER_VOICE)) return { ready: false, reason: `The Piper voice (${config.PIPER_VOICE}) isn't downloaded — run the Local Setup shortcut.` };
  if (spawnSync(config.PIPER_PATH, ["--help"], { stdio: "ignore" }).status !== 0)
    return { ready: false, reason: "Piper isn't installed — run the Local Setup shortcut (it needs Python 3)." };
  return { ready: true };
}

async function probeWriting(): Promise<Probe> {
  if (config.LLM_PROVIDER === "claude") return config.ANTHROPIC_API_KEY ? { ready: true } : { ready: false, reason: "No Claude key — add ANTHROPIC_API_KEY in Settings." };
  if (config.LLM_PROVIDER === "ollama") return probeOllama();
  return probeOpenaiServer();
}

async function probeVoice(): Promise<Probe> {
  if (config.TTS_PROVIDER === "elevenlabs") return config.ELEVENLABS_API_KEY ? { ready: true } : { ready: false, reason: "No ElevenLabs key — add ELEVENLABS_API_KEY in Settings." };
  if (config.TTS_PROVIDER === "piper") return probePiper();
  return { ready: true }; // openai-compatible voice (Kokoro): assume reachable
}

async function probeFootage(): Promise<Probe> {
  if (config.VISUALS_PROVIDER === "generated") return { ready: true };
  if (config.VISUALS_PROVIDER === "pexels") return config.PEXELS_API_KEY ? { ready: true } : { ready: false, reason: "No Pexels key — add PEXELS_API_KEY in Settings, or switch footage to Generated." };
  if (!existsSync(config.FOOTAGE_DIR)) return { ready: false, reason: `No footage folder (${config.FOOTAGE_DIR}) — add clips, or switch footage to Generated.` };
  const files = (await readdir(config.FOOTAGE_DIR, { recursive: true })).map(String).filter((f) => /\.(mp4|mov|m4v|webm|mkv)$/i.test(f));
  return files.length ? { ready: true } : { ready: false, reason: `No clips in ${config.FOOTAGE_DIR}/ — add some, or switch footage to Generated.` };
}

async function status() {
  const [w, v, f] = await Promise.all([probeWriting(), probeVoice(), probeFootage()]);
  const reasons: Record<string, string> = {};
  if (w.reason) reasons.writing = w.reason;
  if (v.reason) reasons.voice = v.reason;
  if (f.reason) reasons.footage = f.reason;
  return {
    mode: config.AGENT_MODE,
    providers: { writing: config.LLM_PROVIDER, voice: config.TTS_PROVIDER, footage: config.VISUALS_PROVIDER },
    ready: { writing: w.ready, voice: v.ready, footage: f.ready },
    reasons,
    canMakeReal: w.ready && v.ready && f.ready,
    pullModel: w.pullable === true, // Ollama is up but the model needs downloading
    model: config.OLLAMA_MODEL,
    language: config.VIDEO_LANGUAGE,
  };
}

// Streams `ollama pull <model>` progress to the page over SSE (Ollama's HTTP
// pull API), so the model downloads inside the app with a progress bar.
async function pullModel(res: ServerResponse): Promise<void> {
  await ensureOllama();
  const base = config.OLLAMA_URL.replace(/\/$/, "");
  try {
    const r = await fetch(`${base}/api/pull`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: config.OLLAMA_MODEL, stream: true }),
    });
    if (!r.ok || !r.body) {
      sse(res, "error", { message: `Ollama couldn't start the download (${r.status}). Is Ollama running?` });
      return void res.end();
    }
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const o = JSON.parse(line) as { status?: string; completed?: number; total?: number; error?: string };
          if (o.error) {
            sse(res, "error", { message: o.error });
            return void res.end();
          }
          const percent = o.total ? Math.round(((o.completed ?? 0) / o.total) * 100) : undefined;
          sse(res, "progress", { status: o.status ?? "", percent });
        } catch {}
      }
    }
    sse(res, "done", { model: config.OLLAMA_MODEL });
    res.end();
  } catch (err) {
    sse(res, "error", { message: `Could not reach Ollama to download the model (${(err as Error).message}).` });
    res.end();
  }
}

async function listVideos() {
  const root = config.OUT_DIR;
  if (!existsSync(root)) return [];
  const out: { name: string; title: string; durationSec?: number; createdAt?: string }[] = [];
  for (const name of await readdir(root)) {
    const dir = join(root, name);
    if (!FOLDER.test(name) || !existsSync(join(dir, "video.mp4"))) continue;
    let title = name;
    let durationSec: number | undefined;
    try {
      const script = JSON.parse(await readFile(join(dir, "script.json"), "utf8"));
      if (script.title) title = script.title;
    } catch {}
    try {
      const r = JSON.parse(await readFile(join(dir, "result.json"), "utf8"));
      durationSec = r.durationSec;
    } catch {}
    const createdAt = (await stat(dir).catch(() => undefined))?.mtime.toISOString();
    out.push({ name, title, durationSec, createdAt });
  }
  return out.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

// Streams an MP4 from a validated output folder, with Range support for seeking.
async function sendVideo(req: IncomingMessage, res: ServerResponse, name: string) {
  if (!FOLDER.test(name)) return void res.writeHead(404).end("Not found");
  const root = resolve(config.OUT_DIR);
  const file = resolve(join(root, name, "video.mp4"));
  if (!file.startsWith(root + sep)) return void res.writeHead(403).end("Forbidden");
  const { size } = await stat(file).catch(() => ({ size: -1 }));
  if (size < 0) return void res.writeHead(404).end("No video");
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
  if (!range) {
    res.writeHead(200, { "content-type": "video/mp4", "content-length": size, "accept-ranges": "bytes" });
    return void createReadStream(file).pipe(res);
  }
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start >= size || start > end) return void res.writeHead(416, { "content-range": `bytes */${size}` }).end();
  res.writeHead(206, { "content-type": "video/mp4", "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${size}`, "accept-ranges": "bytes" });
  createReadStream(file, { start, end }).pipe(res);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 100_000) throw new Error("Body too large");
  }
  return body ? (JSON.parse(body) as Record<string, unknown>) : {};
}

function startJob(topic: string, format: "short" | "long", offline: boolean): Job {
  const job: Job = { id: randomUUID(), topic, status: "running", logs: [], listeners: new Set() };
  jobs.set(job.id, job);
  const log = (m: string) => {
    job.logs.push(m);
    emit(job, "log", m);
  };
  makeVideo({ topic, format, offline, upload: false, log })
    .then((r) => {
      job.status = "done";
      job.result = { name: r.dir.split(/[\\/]/).pop() ?? "", title: r.script.title, durationSec: r.durationSec, costUsd: r.costUsd };
      emit(job, "done", job.result);
    })
    .catch((err: Error) => {
      job.status = "error";
      job.error = err.message;
      emit(job, "error", { message: err.message });
    })
    .finally(() => {
      for (const res of job.listeners) res.end();
      job.listeners.clear();
      setTimeout(() => jobs.delete(job.id), 10 * 60_000); // keep briefly for late reconnects
    });
  return job;
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const p = url.pathname;

  if (req.method === "GET" && p === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    return void res.end(renderStudioPage());
  }
  if (req.method === "GET" && p === "/health") return void res.end("ok");
  if (req.method === "GET" && p === "/favicon.svg") {
    res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "max-age=86400" });
    return void res.end(STUDIO_LOGO);
  }
  if (req.method === "GET" && p === "/api/status") {
    res.writeHead(200, { "content-type": "application/json" });
    return void res.end(JSON.stringify(await status()));
  }
  if (req.method === "GET" && p === "/api/videos") {
    res.writeHead(200, { "content-type": "application/json" });
    return void res.end(JSON.stringify(await listVideos()));
  }
  if (req.method === "GET" && p === "/api/pull-model") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    return void (await pullModel(res));
  }

  if (req.method === "POST" && p === "/api/make") {
    const body = await readJson(req);
    const topic = String(body.topic ?? "").trim();
    if (!topic) return void res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "A topic is required." }));
    const format = body.format === "long" ? "long" : "short";
    const offline = body.offline === true;
    const job = startJob(topic, format, offline);
    res.writeHead(200, { "content-type": "application/json" });
    return void res.end(JSON.stringify({ id: job.id }));
  }

  const ev = /^\/api\/jobs\/([0-9a-f-]+)\/events$/.exec(p);
  if (req.method === "GET" && ev) {
    const job = jobs.get(ev[1]);
    if (!job) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    for (const line of job.logs) sse(res, "log", line); // replay progress so far
    if (job.status === "done") {
      sse(res, "done", job.result);
      return void res.end();
    }
    if (job.status === "error") {
      sse(res, "error", { message: job.error });
      return void res.end();
    }
    job.listeners.add(res);
    req.on("close", () => job.listeners.delete(res));
    return;
  }

  const media = /^\/media\/([^/]+)\/video\.mp4$/.exec(p);
  if (req.method === "GET" && media) return sendVideo(req, res, decodeURIComponent(media[1]));

  if (req.method === "POST" && p === "/api/settings") {
    const body = await readJson(req);
    const values: Record<string, string> = {};
    const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
    if (str("ANTHROPIC_API_KEY")) values.ANTHROPIC_API_KEY = str("ANTHROPIC_API_KEY");
    if (str("ELEVENLABS_API_KEY")) values.ELEVENLABS_API_KEY = str("ELEVENLABS_API_KEY");
    if (str("PEXELS_API_KEY")) values.PEXELS_API_KEY = str("PEXELS_API_KEY");
    if (body.mode === "local" || body.mode === "cloud") values.AGENT_MODE = String(body.mode);
    if (Object.keys(values).length) writeEnv(values);
    res.writeHead(200, { "content-type": "application/json" });
    return void res.end(JSON.stringify({ saved: Object.keys(values), note: "Restart the app for new settings to take effect." }));
  }

  res.writeHead(404).end("Not found");
}

export function startStudioServer(opts: StudioServerOptions): Promise<Server> {
  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
      res.end("Something went wrong.");
    });
  });
  const host = opts.host ?? "127.0.0.1"; // only this computer
  return new Promise((resolve, reject) => {
    server.once("error", (err: NodeJS.ErrnoException) =>
      reject(err.code === "EADDRINUSE" ? new Error(`Port ${opts.port} is already in use. Set STUDIO_PORT to another port.`) : err),
    );
    server.listen(opts.port, host, () => {
      void ensureOllama(); // start the bundled Ollama in the background if needed
      resolve(server);
    });
  });
}
