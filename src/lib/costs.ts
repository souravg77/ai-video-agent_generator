import { config } from "../config.js";

// USD per million tokens (input, output). Unknown models are priced as Opus so estimates err high.
const CLAUDE_PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};

export type TokenUsage = { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };

export function claudeCostUsd(model: string, usage: TokenUsage): number {
  const [inPrice, outPrice] = CLAUDE_PRICES[model] ?? CLAUDE_PRICES["claude-opus-5-5"];
  const input = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) * 1.25 + (usage.cache_read_input_tokens ?? 0) * 0.1;
  return (input * inPrice + usage.output_tokens * outPrice) / 1_000_000;
}

// ElevenLabs bills by characters; the rate depends on your plan, so it's configurable.
export function voiceCostUsd(characters: number): number {
  return (characters / 1000) * config.ELEVENLABS_USD_PER_1K_CHARS;
}
