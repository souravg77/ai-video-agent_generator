import { config } from "../config.js";

// Swappable in tests.
export const http = { fetch: (input: string | URL, init?: RequestInit) => fetch(input, init) };

export type GraphErrorBody = { message: string; code: number; error_subcode?: number; type?: string };

export class GraphError extends Error {
  constructor(public path: string, public body: GraphErrorBody | undefined, status: number) {
    super(explainGraphError(path, body, status));
  }
}

function explainGraphError(path: string, body: GraphErrorBody | undefined, status: number): string {
  const base = `Graph API ${path} failed: ${body?.message ?? `HTTP ${status}`}`;
  if (body?.code === 190) return `${base}. The Meta access token expired or was revoked; run \`npm run auth:meta\` with a fresh token.`;
  if (body?.code === 10 || body?.code === 200) return `${base}. The app is missing a permission; see step 3 of docs/phase0-setup.md.`;
  if (body?.code === 9 && body.error_subcode === 2207042) return `${base}. Instagram's limit on API posts per 24 hours was reached; try later.`;
  if ([4, 17, 32, 613].includes(body?.code ?? -1)) return `${base}. Meta rate limit hit; try again in a while.`;
  return base;
}

export const graphUrl = (path: string) => `https://graph.facebook.com/${config.META_GRAPH_VERSION}/${path.replace(/^\//, "")}`;

async function parse<T>(path: string, res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: GraphErrorBody };
  if (!res.ok || body.error) throw new GraphError(path, body.error, res.status);
  return body;
}

export async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(graphUrl(path));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return parse<T>(path, await http.fetch(url));
}

export async function graphPost<T>(path: string, params: Record<string, string>): Promise<T> {
  return parse<T>(path, await http.fetch(graphUrl(path), { method: "POST", body: new URLSearchParams(params) }));
}

export async function ruploadPost<T>(url: string, headers: Record<string, string>, body?: Uint8Array): Promise<T> {
  return parse<T>(url, await http.fetch(url, { method: "POST", headers, body }));
}
