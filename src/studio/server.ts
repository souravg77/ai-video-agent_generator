import { createReadStream, existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { config } from "../config.js";
import { makeVideo } from "../pipeline/index.js";
import { writeEnv } from "../lib/env-file.js";
import { renderStudioPage } from "./page.js";

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

// readiness of the configured providers, so the page knows whether a real
// (non-offline) video can be made yet.
function status() {
  const writingReady = config.LLM_PROVIDER !== "claude" || Boolean(config.ANTHROPIC_API_KEY);
  const voiceReady = config.TTS_PROVIDER !== "elevenlabs" || Boolean(config.ELEVENLABS_API_KEY);
  const footageReady = config.VISUALS_PROVIDER !== "pexels" || Boolean(config.PEXELS_API_KEY);
  return {
    mode: config.AGENT_MODE,
    providers: { writing: config.LLM_PROVIDER, voice: config.TTS_PROVIDER, footage: config.VISUALS_PROVIDER },
    ready: { writing: writingReady, voice: voiceReady, footage: footageReady },
    canMakeReal: writingReady && voiceReady && footageReady,
    language: config.VIDEO_LANGUAGE,
  };
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
  if (req.method === "GET" && p === "/api/status") {
    res.writeHead(200, { "content-type": "application/json" });
    return void res.end(JSON.stringify(status()));
  }
  if (req.method === "GET" && p === "/api/videos") {
    res.writeHead(200, { "content-type": "application/json" });
    return void res.end(JSON.stringify(await listVideos()));
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
    server.listen(opts.port, host, () => resolve(server));
  });
}
