import { existsSync } from "node:fs";
import dotenv from "dotenv";
import { z } from "zod";

// BRAND=cooking loads brands/cooking.env first, so its settings win over the shared .env.
// Real environment variables win over both.
export const BRAND = process.env.BRAND?.trim() || undefined;
export const envFile = BRAND ? `brands/${BRAND}.env` : ".env";
if (BRAND) {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(BRAND)) throw new Error(`BRAND "${BRAND}" may only use letters, digits, - and _.`);
  if (!existsSync(envFile)) throw new Error(`BRAND=${BRAND} but ${envFile} doesn't exist. Copy brands/example.env to start one.`);
  dotenv.config({ path: envFile });
}
dotenv.config();

const optional = z.string().optional().transform((v) => (v ? v : undefined));

const schema = z.object({
  ANTHROPIC_API_KEY: optional,
  CLAUDE_MODEL: z.string().default("claude-opus-5-5"),

  ELEVENLABS_API_KEY: optional,
  ELEVENLABS_VOICE_ID: z.string().default("21m00Tcm4TlvDq8ikWAM"),
  ELEVENLABS_USD_PER_1K_CHARS: z.coerce.number().min(0).default(0.3),
  PEXELS_API_KEY: optional,
  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
  DATABASE_URL: optional,
  // Postgres schema for this brand's tables, so several brands can share one database. Defaults to the brand name.
  DB_SCHEMA: z
    .string()
    .regex(/^[a-z_][a-z0-9_]*$/, "DB_SCHEMA may only use lowercase letters, digits and _")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  OUT_DIR: optional,

  // Generated video for the opening scene (off | hook) via fal.ai; everything else stays stock footage
  GENERATED_CLIPS: z.enum(["off", "hook"]).default("off"),
  FAL_KEY: optional,
  FAL_VIDEO_MODEL: z.string().default("fal-ai/kling-video/v2.1/standard/text-to-video"),
  FAL_EXTRA_INPUT: optional, // JSON merged into the model's input, for model-specific options
  GENERATED_CLIP_SECONDS: z.coerce.number().int().min(1).max(20).default(5),
  // Your model's price, for cost tracking; check fal.ai's pricing page
  GENERATED_CLIP_USD_PER_SECOND: z.coerce.number().min(0).default(0.1),

  // Language the videos are written and spoken in, e.g. "Spanish". Stock footage searches stay in English.
  VIDEO_LANGUAGE: z.string().default("English"),
  // short = 9:16 Shorts/Reels; long = 16:9 YouTube videos of a few minutes (YouTube only)
  VIDEO_FORMAT: z.enum(["short", "long"]).default("short"),
  // Needs to cover your language's script, e.g. "Noto Sans CJK JP" for Japanese
  CAPTION_FONT: z.string().default("DejaVu Sans"),

  R2_ACCOUNT_ID: optional,
  R2_ACCESS_KEY_ID: optional,
  R2_SECRET_ACCESS_KEY: optional,
  R2_BUCKET: optional,
  R2_PUBLIC_BASE_URL: optional,

  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  YOUTUBE_REFRESH_TOKEN: optional,

  META_APP_ID: optional,
  META_APP_SECRET: optional,
  META_SHORT_LIVED_USER_TOKEN: optional,
  META_PAGE_ID: optional,
  META_PAGE_ACCESS_TOKEN: optional,
  META_IG_USER_ID: optional,
  META_GRAPH_VERSION: z.string().default("v21.0"),

  // Agent (phase 4)
  AGENT_NICHE: optional,
  AGENT_POST_TIMES_UTC: z.string().default("15:00"),
  AGENT_PLATFORMS: z.string().default("youtube,facebook,instagram"),
  AGENT_PLAN_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  AGENT_RENDER_LEAD_HOURS: z.coerce.number().min(1).default(36),
  AGENT_AUTO_APPROVE: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  // Auto-approve only kicks in once this many videos have been posted with approval
  AGENT_AUTO_APPROVE_AFTER: z.coerce.number().int().min(0).default(30),
  // Rotate hook styles and favour the ones that get more views (see src/pipeline/hooks.ts)
  AGENT_HOOK_TESTS: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  // Post some platforms later than the slot, in minutes, e.g. "facebook=60,instagram=120"
  AGENT_PLATFORM_DELAYS: optional,
  AGENT_TICK_SECONDS: z.coerce.number().int().min(10).default(60),
  // Stop making new videos once this month's spend (Claude + voice + generated clips) reaches this, in USD
  AGENT_MONTHLY_BUDGET_USD: z.coerce.number().min(0).optional(),
  // Delete local files of posted or rejected videos after this many days (0 = keep forever)
  AGENT_KEEP_RENDERS_DAYS: z.coerce.number().int().min(0).default(14),
  REVIEW_PORT: z.coerce.number().int().default(3000),
  REVIEW_PASSWORD: optional,
  // Address the review page listens on; the Docker image sets 0.0.0.0 so Caddy can reach it
  REVIEW_HOST: optional,
  // Shown on the public /privacy and /data-deletion pages that Google and Meta reviewers ask for
  // Approve from your phone: a bot from @BotFather and your chat id (see docs/hosting.md)
  TELEGRAM_BOT_TOKEN: optional,
  TELEGRAM_CHAT_ID: optional,
  PRIVACY_OWNER_NAME: optional,
  PRIVACY_CONTACT_EMAIL: optional,
  ALERT_WEBHOOK_URL: optional,
  AGENT_STATS_HOURS: z.coerce.number().min(1).default(6),
  // 0 = Sunday … 6 = Saturday; the weekly report goes out on this day after 09:00 UTC
  AGENT_REPORT_WEEKDAY: z.coerce.number().int().min(0).max(6).default(1),
  // Fetch new comments and have Claude draft replies for you to approve on the review page
  AGENT_COMMENT_REPLIES: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Config = Omit<z.infer<typeof schema>, "OUT_DIR"> & { OUT_DIR: string };

const parsed = schema.parse(process.env);
export const config: Config = {
  ...parsed,
  DB_SCHEMA: parsed.DB_SCHEMA ?? (BRAND ? BRAND.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^(\d)/, "_$1") : undefined),
  OUT_DIR: parsed.OUT_DIR ?? (BRAND ? `out/${BRAND}` : "out"),
};

// Groups of settings each phase needs; used by the setup check.
export const requirements = {
  "Claude API": ["ANTHROPIC_API_KEY"],
  "Voice (ElevenLabs)": ["ELEVENLABS_API_KEY"],
  "Stock footage (Pexels)": ["PEXELS_API_KEY"],
  Database: ["DATABASE_URL"],
  "Storage (R2)": ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE_URL"],
  YouTube: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"],
  "Facebook Page": ["META_APP_ID", "META_APP_SECRET", "META_PAGE_ID", "META_PAGE_ACCESS_TOKEN"],
  Instagram: ["META_IG_USER_ID", "META_PAGE_ACCESS_TOKEN"],
  "Telegram approval (optional)": ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"],
} as const satisfies Record<string, readonly (keyof Config)[]>;
