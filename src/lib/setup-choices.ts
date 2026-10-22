import type { Platform } from "./db.js";

// What `npm run setup` asks: for each step, a free local tool or an API to connect.
export type SetupChoices = {
  writing: "claude" | "ollama";
  voice: "elevenlabs" | "piper";
  footage: "pexels" | "folder" | "generated";
  posting: "api" | "manual";
  platforms: Platform[];
};

export type SetupOption<T extends string> = { value: T; label: string; needs: string };

export const STEP_OPTIONS = {
  writing: [
    { value: "claude", label: "Claude API (best scripts; pay per use)", needs: "ANTHROPIC_API_KEY from console.anthropic.com" },
    { value: "ollama", label: "Ollama on this computer (free, offline)", needs: "Ollama from ollama.com; about 16 GB RAM for the default model" },
  ],
  voice: [
    { value: "elevenlabs", label: "ElevenLabs API (most natural voices; paid plan)", needs: "ELEVENLABS_API_KEY from elevenlabs.io" },
    { value: "piper", label: "Piper on this computer (free, offline)", needs: "Python 3; npm run local:setup installs it" },
  ],
  footage: [
    { value: "pexels", label: "Pexels API (real stock footage; free key)", needs: "PEXELS_API_KEY from pexels.com/api" },
    { value: "folder", label: "Your own clips folder (free)", needs: "clips in footage/, named by what they show" },
    { value: "generated", label: "Generated backgrounds (free, nothing to set up)", needs: "nothing" },
  ],
  posting: [
    { value: "api", label: "Post automatically via YouTube and Meta APIs (free; one-time app setup)", needs: "a Google Cloud OAuth client and/or a Meta app (docs/phase0-setup.md)" },
    { value: "manual", label: "Export files and upload by hand (no setup)", needs: "nothing" },
  ],
} as const satisfies { [K in keyof Omit<SetupChoices, "platforms">]: readonly SetupOption<SetupChoices[K]>[] };

// The .env settings for a set of choices. Every provider is written explicitly so the file says what was picked.
export function envForChoices(c: SetupChoices): Record<string, string> {
  const allLocal = c.writing === "ollama" && c.voice === "piper" && c.footage !== "pexels" && c.posting === "manual";
  return {
    AGENT_MODE: allLocal ? "local" : "cloud",
    LLM_PROVIDER: c.writing,
    TTS_PROVIDER: c.voice,
    VISUALS_PROVIDER: c.footage,
    PUBLISH_MODE: c.posting,
    AGENT_PLATFORMS: c.platforms.join(","),
  };
}

// Keys to ask for, in order, given the choices. Instagram also needs public storage, because Meta fetches the video by URL.
export function keysToAsk(c: SetupChoices): { key: string; hint: string; secret: boolean }[] {
  const keys: { key: string; hint: string; secret: boolean }[] = [];
  if (c.writing === "claude") keys.push({ key: "ANTHROPIC_API_KEY", hint: "console.anthropic.com → API keys", secret: true });
  if (c.voice === "elevenlabs") keys.push({ key: "ELEVENLABS_API_KEY", hint: "elevenlabs.io → Profile → API key", secret: true });
  if (c.footage === "pexels") keys.push({ key: "PEXELS_API_KEY", hint: "pexels.com/api (free)", secret: true });
  if (c.posting === "api") {
    if (c.platforms.includes("youtube")) {
      keys.push({ key: "GOOGLE_CLIENT_ID", hint: "Google Cloud → Credentials → OAuth client (Desktop app)", secret: false });
      keys.push({ key: "GOOGLE_CLIENT_SECRET", hint: "same OAuth client", secret: true });
    }
    if (c.platforms.some((p) => p !== "youtube")) {
      keys.push({ key: "META_APP_ID", hint: "developers.facebook.com → your app → App settings → Basic", secret: false });
      keys.push({ key: "META_APP_SECRET", hint: "same page", secret: true });
      keys.push({ key: "META_SHORT_LIVED_USER_TOKEN", hint: "Graph API Explorer → Generate token (permissions in docs/phase0-setup.md step 3)", secret: true });
    }
    if (c.platforms.includes("instagram")) {
      for (const key of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE_URL"]) {
        keys.push({ key, hint: "Cloudflare R2 (docs/phase0-setup.md step 4)", secret: key === "R2_SECRET_ACCESS_KEY" });
      }
    }
  }
  return keys;
}
