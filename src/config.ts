import "dotenv/config";
import { z } from "zod";

const optional = z.string().optional().transform((v) => (v ? v : undefined));

const schema = z.object({
  ANTHROPIC_API_KEY: optional,
  CLAUDE_MODEL: z.string().default("claude-opus-5-5"),

  ELEVENLABS_API_KEY: optional,
  ELEVENLABS_VOICE_ID: z.string().default("21m00Tcm4TlvDq8ikWAM"),
  PEXELS_API_KEY: optional,
  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
  DATABASE_URL: optional,

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
});

export type Config = z.infer<typeof schema>;

export const config: Config = schema.parse(process.env);

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
} as const satisfies Record<string, readonly (keyof Config)[]>;
