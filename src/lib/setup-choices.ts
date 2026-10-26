import type { Platform } from "./db.js";

// What `npm run setup` asks: for each step, a free local tool or an API to connect.
export type SetupChoices = {
  writing: "claude" | "ollama" | "openai-compatible";
  voice: "elevenlabs" | "piper" | "openai-compatible";
  footage: "pexels" | "folder" | "generated" | "generated-local";
  posting: "api" | "manual";
  platforms: Platform[];
};

export type SetupOption<T extends string> = { value: T; label: string; needs: string };

export const STEP_OPTIONS = {
  writing: [
    { value: "claude", label: "Claude API (best scripts; pay per use)", needs: "ANTHROPIC_API_KEY from console.anthropic.com" },
    { value: "ollama", label: "Ollama on this computer (free, offline)", needs: "Ollama from ollama.com; about 16 GB RAM for the default model" },
    {
      value: "openai-compatible",
      label: "Another open-source model server: LM Studio, vLLM, llama.cpp, or hosted open models (Groq, Together, OpenRouter)",
      needs: "the server running, or an API key for a hosted one",
    },
  ],
  voice: [
    { value: "elevenlabs", label: "ElevenLabs API (most natural voices; paid plan)", needs: "ELEVENLABS_API_KEY from elevenlabs.io" },
    { value: "piper", label: "Piper on this computer (free, offline)", needs: "Python 3; npm run local:setup installs it" },
    { value: "openai-compatible", label: "Kokoro or another open-source voice server (free, more natural than Piper)", needs: "Kokoro-FastAPI running (Docker: docs/open-source-ai.md)" },
  ],
  footage: [
    { value: "pexels", label: "Pexels API (real stock footage; free key)", needs: "PEXELS_API_KEY from pexels.com/api" },
    { value: "folder", label: "Your own clips folder (free)", needs: "clips in footage/, named by what they show" },
    { value: "generated", label: "Generated backgrounds (free, nothing to set up)", needs: "nothing" },
    { value: "generated-local", label: "Local AI footage: FLUX/SDXL on your own GPU (free; a real image per scene)", needs: "an OpenAI-style image server running (docs/open-source-ai.md)" },
  ],
  posting: [
    { value: "api", label: "Post automatically via YouTube and Meta APIs (free; one-time app setup)", needs: "a Google Cloud OAuth client and/or a Meta app (docs/phase0-setup.md)" },
    { value: "manual", label: "Export files and upload by hand (no setup)", needs: "nothing" },
  ],
} as const satisfies { [K in keyof Omit<SetupChoices, "platforms">]: readonly SetupOption<SetupChoices[K]>[] };

// Servers that speak the OpenAI chat API and run open models. The model is only an example; any model the server lists works.
export const OPEN_MODEL_SERVERS = [
  { name: "LM Studio (desktop app)", url: "http://localhost:1234/v1", key: false, model: "qwen3-14b", models: "the model id LM Studio shows under Developer" },
  { name: "vLLM", url: "http://localhost:8000/v1", key: false, model: "Qwen/Qwen3-14B", models: "the model you started vLLM with" },
  { name: "llama.cpp server", url: "http://localhost:8080/v1", key: false, model: "local", models: "any name; it serves the model it was started with" },
  { name: "Groq (hosted)", url: "https://api.groq.com/openai/v1", key: true, model: "llama-3.3-70b-versatile", models: "console.groq.com/docs/models" },
  { name: "Together AI (hosted)", url: "https://api.together.xyz/v1", key: true, model: "meta-llama/Llama-3.3-70B-Instruct-Turbo", models: "api.together.ai/models" },
  { name: "OpenRouter (hosted)", url: "https://openrouter.ai/api/v1", key: true, model: "qwen/qwen3-235b-a22b", models: "openrouter.ai/models" },
  { name: "Other (enter the address)", url: "", key: false, model: "", models: "your server's model list (GET /v1/models)" },
] as const;

// The .env settings for a set of choices. Every provider is written explicitly so the file says what was picked.
export function envForChoices(c: SetupChoices): Record<string, string> {
  const allLocal = c.writing !== "claude" && c.voice !== "elevenlabs" && c.footage !== "pexels" && c.posting === "manual";
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
