import { BRAND, config } from "../config.js";
import { sendText } from "./telegram.js";

const NAME = `Video agent${BRAND ? ` (${BRAND})` : ""}`;

// Logs and, if ALERT_WEBHOOK_URL is set, posts to it. Slack reads `text`, Discord reads `content`.
export async function alert(message: string): Promise<void> {
  console.error(`[alert] ${message}`);
  await sendWebhook(`${NAME}: ${message}`);
  await sendText(`${NAME}: ${message}`).catch((err) => console.error(`[alert] Telegram failed: ${(err as Error).message}`));
}

// Discord rejects messages over 2,000 characters.
export async function sendWebhook(text: string): Promise<boolean> {
  if (!config.ALERT_WEBHOOK_URL) return false;
  try {
    const res = await fetch(config.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, content: text.length > 1990 ? `${text.slice(0, 1989)}…` : text }),
    });
    if (!res.ok) console.error(`[alert] webhook returned ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error(`[alert] webhook failed: ${(err as Error).message}`);
    return false;
  }
}
