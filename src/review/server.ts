import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";
import * as store from "../agent/store.js";
import { renderPage } from "./page.js";

export type ReviewServerOptions = { port: number; password?: string; host?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function authorized(req: IncomingMessage, password?: string): boolean {
  if (!password) return true;
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Basic ")) return false;
  const given = Buffer.from(header.slice(6), "base64").toString().split(":").slice(1).join(":");
  const a = Buffer.from(given);
  const b = Buffer.from(password);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Rejects form posts sent from other sites.
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin ?? req.headers.referer;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 100_000) throw new Error("Form too large");
  }
  return new URLSearchParams(body);
}

const redirect = (res: ServerResponse, flash: string) => {
  res.writeHead(303, { location: `/?flash=${encodeURIComponent(flash)}` }).end();
};

// Streams the MP4 with Range support, which browsers need to seek and which Safari needs to play at all.
async function sendVideo(req: IncomingMessage, res: ServerResponse, id: string) {
  const v = await store.getVideo(id);
  if (!v?.local_dir) return void res.writeHead(404).end("No video file");
  const file = join(v.local_dir, "video.mp4");
  const { size } = await stat(file).catch(() => ({ size: -1 }));
  if (size < 0) return void res.writeHead(404).end("Video file missing on disk");

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

export function parseHashtags(s: string): string[] {
  return [...new Set(s.split(/[\s,]+/).map((h) => h.replace(/^#/, "")).filter(Boolean))];
}

export function parseUtcInput(s: string | null): Date | undefined {
  if (!s) return undefined;
  const d = new Date(`${s}${s.length === 16 ? ":00" : ""}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function handle(req: IncomingMessage, res: ServerResponse, opts: ReviewServerOptions) {
  if (!authorized(req, opts.password)) {
    return void res.writeHead(401, { "www-authenticate": 'Basic realm="Video review"' }).end("Sign in required");
  }
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/") {
    const now = new Date();
    const [review, upcoming, recent] = await Promise.all([
      store.listVideos(["rendered"]),
      store.listVideos(["idea", "rendering", "approved", "posting"]),
      store.listVideos(["posted", "failed", "rejected"], 20, "desc"),
    ]);
    const posts = await store.allPosts([...upcoming, ...recent].map((v) => v.id));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    return void res.end(renderPage({ review, upcoming, recent, posts, now, flash: url.searchParams.get("flash") ?? undefined }));
  }
  if (req.method === "GET" && url.pathname === "/health") return void res.end("ok");

  const m = /^\/videos\/([^/]+)\/(file|approve|reject|retry)$/.exec(url.pathname);
  if (!m || !UUID.test(m[1])) return void res.writeHead(404).end("Not found");
  const [, id, action] = m;

  if (action === "file" && req.method === "GET") return sendVideo(req, res, id);
  if (req.method !== "POST") return void res.writeHead(405).end();
  if (!sameOrigin(req)) return void res.writeHead(403).end("Cross-site request blocked");

  const form = await readForm(req);
  if (action === "approve") {
    const title = (form.get("title") ?? "").trim().slice(0, 100);
    if (!title) return redirect(res, "A title is required to approve.");
    const ok = await store.approve(id, {
      title,
      description: (form.get("description") ?? "").trim(),
      hashtags: parseHashtags(form.get("hashtags") ?? ""),
      publishAt: parseUtcInput(form.get("publish_at")),
    });
    return redirect(res, ok ? `Approved "${title}".` : "That video was already handled.");
  }
  if (action === "reject") {
    const ok = await store.reject(id, (form.get("note") ?? "").trim());
    return redirect(res, ok ? "Rejected. Its slot will be refilled with a new idea." : "That video was already handled.");
  }
  const ok = await store.retry(id);
  return redirect(res, ok ? "Queued to try again." : "Only failed videos can be retried.");
}

export function startReviewServer(opts: ReviewServerOptions): Promise<Server> {
  const server = createServer((req, res) => {
    handle(req, res, opts).catch((err) => {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
      res.end("Something went wrong; check the agent's logs.");
    });
  });
  // Without a password, only this computer can open the page.
  const host = opts.host ?? (opts.password ? "0.0.0.0" : "127.0.0.1");
  return new Promise((resolve, reject) => {
    server.once("error", (err: NodeJS.ErrnoException) =>
      reject(err.code === "EADDRINUSE" ? new Error(`Port ${opts.port} is already in use. Set REVIEW_PORT to another port or stop the other program.`) : err),
    );
    server.listen(opts.port, host, () => resolve(server));
  });
}
