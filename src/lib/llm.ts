import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4"; // the SDK's zodOutputFormat helper needs zod v4 schemas
import { config } from "../config.js";
import { claudeCostUsd } from "./costs.js";

// One place for every "ask the AI for JSON" call (scripts, ideas, translations, comment drafts).
// LLM_PROVIDER=claude uses the Claude API; LLM_PROVIDER=ollama uses a model running on your own machine, at no cost.

export type JsonAsk<S extends z.ZodType> = {
  schema: S;
  system?: string;
  user: string;
  maxTokens: number;
  effort?: "low" | "medium";
  what: string; // for error messages, e.g. `write a script for "cats"`
};

export type JsonAnswer<T> = { data: T; costUsd: number };

export const ollama = { fetch: (input: string, init?: RequestInit) => fetch(input, init) };

export function llmName(): string {
  return config.LLM_PROVIDER === "ollama" ? `the local model (${config.OLLAMA_MODEL})` : "Claude";
}

export async function askJson<S extends z.ZodType>(ask: JsonAsk<S>, anthropic?: Anthropic): Promise<JsonAnswer<z.infer<S>>> {
  return config.LLM_PROVIDER === "ollama" ? ollamaJson(ask) : claudeJson(ask, anthropic ?? new Anthropic());
}

async function claudeJson<S extends z.ZodType>(ask: JsonAsk<S>, client: Anthropic): Promise<JsonAnswer<z.infer<S>>> {
  const response = await client.messages.parse({
    model: config.CLAUDE_MODEL,
    max_tokens: ask.maxTokens,
    output_config: { effort: ask.effort ?? "medium", format: zodOutputFormat(ask.schema) },
    ...(ask.system ? { system: ask.system } : {}),
    messages: [{ role: "user", content: ask.user }],
  });
  if (response.stop_reason === "refusal") throw new Error(`Claude declined to ${ask.what}.`);
  if (response.stop_reason === "max_tokens") throw new Error(`Claude ran out of room before finishing (${ask.what}).`);
  if (!response.parsed_output) throw new Error(`Claude's answer did not match the expected format (${ask.what}).`);
  return { data: response.parsed_output as z.infer<S>, costUsd: claudeCostUsd(config.CLAUDE_MODEL, response.usage) };
}

type OllamaMessage = { role: "system" | "user" | "assistant"; content: string };

// Ollama constrains the output to the JSON schema; we still validate, and give the model one retry with the error.
async function ollamaJson<S extends z.ZodType>(ask: JsonAsk<S>): Promise<JsonAnswer<z.infer<S>>> {
  const schema = z.toJSONSchema(ask.schema);
  const messages: OllamaMessage[] = [
    { role: "system", content: `${ask.system ?? ""}\n\nReply with a single JSON object that matches the given schema. No other text.`.trim() },
    { role: "user", content: ask.user },
  ];
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await ollama.fetch(`${config.OLLAMA_URL.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: config.OLLAMA_MODEL,
          stream: false,
          format: schema,
          messages,
          options: { temperature: 0.7, num_ctx: config.OLLAMA_CONTEXT, num_predict: ask.maxTokens },
        }),
      });
    } catch (err) {
      throw new Error(`Can't reach Ollama at ${config.OLLAMA_URL} (${(err as Error).message}). Is it running? Start it with \`ollama serve\`.`);
    }
    if (res.status === 404) throw new Error(`Ollama doesn't have the model "${config.OLLAMA_MODEL}". Run \`ollama pull ${config.OLLAMA_MODEL}\`.`);
    if (!res.ok) throw new Error(`Ollama returned ${res.status}: ${await res.text()}`);
    const content = ((await res.json()) as { message?: { content?: string } }).message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      lastError = "The reply was not valid JSON.";
      messages.push({ role: "assistant", content }, { role: "user", content: `${lastError} Reply again with only the JSON object.` });
      continue;
    }
    const result = ask.schema.safeParse(parsed);
    if (result.success) return { data: result.data as z.infer<S>, costUsd: 0 };
    lastError = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    messages.push({ role: "assistant", content }, { role: "user", content: `That JSON had problems: ${lastError}. Fix them and reply with only the corrected JSON object.` });
  }
  throw new Error(`The local model's answer did not match the expected format (${ask.what}): ${lastError}. A larger model usually fixes this (OLLAMA_MODEL).`);
}
