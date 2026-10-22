// Finds your Telegram chat id for TELEGRAM_CHAT_ID.
//   1. Create a bot with @BotFather and put its token in TELEGRAM_BOT_TOKEN
//   2. Send your bot any message (or add it to a group and send a message there)
//   3. npm run telegram:setup
import { config, envFile } from "../src/config.js";
import { writeEnv } from "../src/lib/env-file.js";

if (!config.TELEGRAM_BOT_TOKEN) {
  console.error(`Set TELEGRAM_BOT_TOKEN in ${envFile} first (create a bot by messaging @BotFather on Telegram).`);
  process.exit(1);
}
const res = await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/getUpdates`);
const data = (await res.json()) as { ok: boolean; description?: string; result: { message?: { chat: { id: number; title?: string; first_name?: string; type: string } } }[] };
if (!data.ok) {
  console.error(`Telegram said: ${data.description}. Check the token.`);
  process.exit(1);
}
const chats = new Map(data.result.filter((u) => u.message).map((u) => [u.message!.chat.id, u.message!.chat]));
if (chats.size === 0) {
  console.error("No messages yet. Send your bot a message on Telegram, then run this again.");
  process.exit(1);
}
if (chats.size > 1) {
  for (const c of chats.values()) console.log(`${c.id}  ${c.title ?? c.first_name} (${c.type})`);
  console.log(`Several chats found; put the one you want in ${envFile} as TELEGRAM_CHAT_ID.`);
} else {
  const [chat] = chats.values();
  writeEnv({ TELEGRAM_CHAT_ID: String(chat.id) });
  console.log(`Saved TELEGRAM_CHAT_ID=${chat.id} (${chat.title ?? chat.first_name}) to ${envFile}. Restart the agent to start getting videos there.`);
}
