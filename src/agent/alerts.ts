import { config } from "../config.js";

// Logs and, if ALERT_WEBHOOK_URL is set, posts to it. Slack reads `text`, Discord reads `content`.
export async function alert(message: string): Promise<void> {
  console.error(`[alert] ${message}`);
  if (!config.ALERT_WEBHOOK_URL) return;
  try {
    await fetch(config.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `Video agent: ${message}`, content: `Video agent: ${message}` }),
    });
  } catch (err) {
    console.error(`[alert] webhook failed: ${(err as Error).message}`);
  }
}
