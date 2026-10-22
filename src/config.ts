import "dotenv/config";
import { z } from "zod";

const optional = z.string().optional().transform((v) => (v ? v : undefined));

const schema = z.object({
  ANTHROPIC_API_KEY: optional,
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
  Database: ["DATABASE_URL"],
  "Storage (R2)": ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE_URL"],
  YouTube: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"],
  "Facebook Page": ["META_APP_ID", "META_APP_SECRET", "META_PAGE_ID", "META_PAGE_ACCESS_TOKEN"],
  Instagram: ["META_IG_USER_ID", "META_PAGE_ACCESS_TOKEN"],
} as const satisfies Record<string, readonly (keyof Config)[]>;
