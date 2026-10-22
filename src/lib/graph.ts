import { config } from "../config.js";

// Minimal Meta Graph API GET helper.
export async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${config.META_GRAPH_VERSION}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const body = (await res.json()) as T & { error?: { message: string; code: number } };
  if (!res.ok || body.error) {
    throw new Error(`Graph API ${path} failed: ${body.error?.message ?? res.statusText}`);
  }
  return body;
}
