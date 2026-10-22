import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { BRAND, config } from "../config.js";
import * as store from "./store.js";

// Approve from your phone: each video that needs review is sent to a Telegram chat with Approve and Reject buttons.
// The agent polls for button presses on every tick, so no public webhook URL is needed.

export const tg = { fetch: (input: string, init?: RequestInit) => fetch(input, init) };

export const telegramConfigured = () => Boolean(config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID);

const MAX_UPLOAD = 49 * 1024 * 1024; // bots can upload up to 50 MB

async function call<T>(method: string, body: Record<string, unknown> | FormData): Promise<T> {
  const res = await tg.fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    ...(body instanceof FormData ? { body } : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description ?? res.status}`);
  return data.result;
}

const fmt = (d: Date | null) => (d ? `${d.toISOString().slice(0, 16).replace("T", " ")} UTC` : "unscheduled");

export function reviewCaption(v: store.VideoRow): string {
  return [`${BRAND ? `[${BRAND}] ` : ""}Needs review: ${v.title ?? v.topic}`, `Posts ${fmt(v.publish_at)} to ${v.platforms.join(", ")}`, v.description ?? ""]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1000);
}

const buttons = (id: string) => ({
  inline_keyboard: [[{ text: "Approve", callback_data: `approve:${id}` }, { text: "Reject", callback_data: `reject:${id}` }]],
});

export async function sendForReview(v: store.VideoRow): Promise<void> {
  if (!telegramConfigured()) return;
  const file = v.local_dir ? join(v.local_dir, "video.mp4") : undefined;
  const size = file ? (await stat(file).catch(() => undefined))?.size : undefined;
  if (file && size && size <= MAX_UPLOAD) {
    const form = new FormData();
    form.set("chat_id", String(config.TELEGRAM_CHAT_ID));
    form.set("caption", reviewCaption(v));
    form.set("supports_streaming", "true");
    form.set("reply_markup", JSON.stringify(buttons(v.id)));
    form.set("video", new Blob([await readFile(file)], { type: "video/mp4" }), "video.mp4");
    await call("sendVideo", form);
  } else {
    await call("sendMessage", { chat_id: config.TELEGRAM_CHAT_ID, text: `${reviewCaption(v)}\n\n(Video too large to send here; watch it on the review page.)`, reply_markup: buttons(v.id) });
  }
}

export async function sendText(text: string): Promise<void> {
  if (!telegramConfigured()) return;
  await call("sendMessage", { chat_id: config.TELEGRAM_CHAT_ID, text: text.slice(0, 4000) });
}

type Update = {
  update_id: number;
  callback_query?: { id: string; data?: string; from: { id: number }; message?: { message_id: number; chat: { id: number }; caption?: string; text?: string } };
};

// Handles button presses since the last poll. Only presses from the configured chat count.
export async function pollReviews(): Promise<{ approved: number; rejected: number }> {
  const out = { approved: 0, rejected: 0 };
  if (!telegramConfigured()) return out;
  const offset = Number((await store.getState("telegram_offset")) ?? 0);
  const updates = await call<Update[]>("getUpdates", { offset, timeout: 0, allowed_updates: ["callback_query"] });
  for (const u of updates) {
    await store.setState("telegram_offset", String(u.update_id + 1));
    const q = u.callback_query;
    if (!q?.data || !q.message || String(q.message.chat.id) !== String(config.TELEGRAM_CHAT_ID)) continue;
    const [action, id] = q.data.split(":");
    const v = await store.getVideo(id);
    let result = "That video was already handled.";
    if (v && action === "approve") {
      const ok = await store.approve(id, { title: v.title ?? v.topic, description: v.description ?? "", hashtags: v.hashtags });
      if (ok) (out.approved++, (result = `Approved. Posts ${fmt(v.publish_at)}.`));
    } else if (v && action === "reject") {
      const ok = await store.reject(id, "Rejected from Telegram");
      if (ok) (out.rejected++, (result = "Rejected. The slot will get a new idea."));
    }
    await call("answerCallbackQuery", { callback_query_id: q.id, text: result }).catch(() => {});
    const original = q.message.caption ?? q.message.text ?? "";
    const edited = { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } };
    await (q.message.caption != null
      ? call("editMessageCaption", { ...edited, caption: `${original}\n\n${result}`.slice(0, 1024) })
      : call("editMessageText", { ...edited, text: `${original}\n\n${result}`.slice(0, 4096) })
    ).catch(() => {});
  }
  return out;
}
