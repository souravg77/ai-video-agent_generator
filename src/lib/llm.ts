import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4"; // the SDK's zodOutputFormat helper needs zod v4 schemas
import { config } from "../config.js";
import { claudeCostUsd } from "./costs.js";

// One place for every "ask the AI for JSON" call (scripts, ideas, translations, comment drafts).
// LLM_PROVIDER=claude uses the Claude API; ollama uses a model on your own machine; openai-compatible uses any
// open-source model server that speaks the OpenAI chat API, on your machine or hosted.

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
export const openai = { fetch: (input: string, init?: RequestInit) => fetch(input, init) };

export function llmName(): string {
  if (config.LLM_PROVIDER === "ollama") return `The local model (${config.OLLAMA_MODEL})`;
  if (config.LLM_PROVIDER === "openai-compatible") return `The model ${config.OPENAI_MODEL}`;
  return "Claude";
}

export async function askJson<S extends z.ZodType>(ask: JsonAsk<S>, anthropic?: Anthropic): Promise<JsonAnswer<z.infer<S>>> {
  if (config.LLM_PROVIDER === "ollama") return ollamaJson(ask);
  if (config.LLM_PROVIDER === "openai-compatible") return openAiCompatibleJson(ask);
  return claudeJson(ask, anthropic ?? new Anthropic());
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

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type Reply = { content: string; costUsd: number };

// Open models don't always follow the schema even when the server constrains them, so every answer is validated,
// and the model gets one retry with the problem spelled out.
async function jsonWithRetry<S extends z.ZodType>(ask: JsonAsk<S>, send: (messages: ChatMessage[]) => Promise<Reply>, hint: string): Promise<JsonAnswer<z.infer<S>>> {
  const messages: ChatMessage[] = [
    { role: "system", content: `${ask.system ?? ""}\n\nReply with a single JSON object that matches the given schema. No other text.`.trim() },
    { role: "user", content: ask.user },
  ];
  let lastError = "";
  let costUsd = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await send(messages);
    costUsd += reply.costUsd;
    const content = reply.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""); // some models wrap JSON in a code fence
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      lastError = "The reply was not valid JSON.";
      messages.push({ role: "assistant", content: reply.content }, { role: "user", content: `${lastError} Reply again with only the JSON object.` });
      continue;
    }
    const result = ask.schema.safeParse(parsed);
    if (result.success) return { data: result.data as z.infer<S>, costUsd };
    lastError = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    messages.push({ role: "assistant", content: reply.content }, { role: "user", content: `That JSON had problems: ${lastError}. Fix them and reply with only the corrected JSON object.` });
  }
  throw new Error(`${llmName()}'s answer did not match the expected format (${ask.what}): ${lastError}. ${hint}`);
}

// Ollama constrains the output to the JSON schema with its native `format` option.
function ollamaJson<S extends z.ZodType>(ask: JsonAsk<S>): Promise<JsonAnswer<z.infer<S>>> {
  const schema = z.toJSONSchema(ask.schema);
  return jsonWithRetry(
    ask,
    async (messages) => {
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
      return { content: ((await res.json()) as { message?: { content?: string } }).message?.content ?? "", costUsd: 0 };
    },
    "A larger model usually fixes this (OLLAMA_MODEL).",
  );
}

// Any server that speaks the OpenAI chat API: LM Studio, vLLM, llama.cpp, LocalAI, or hosts of open models
// (Groq, Together, OpenRouter, DeepInfra). Asks for the exact JSON schema, and falls back to plain JSON mode
// for servers that don't support schemas.
function openAiCompatibleJson<S extends z.ZodType>(ask: JsonAsk<S>): Promise<JsonAnswer<z.infer<S>>> {
  const schema = z.toJSONSchema(ask.schema);
  const base = config.OPENAI_BASE_URL.replace(/\/$/, "");
  let mode = config.OPENAI_JSON_MODE;
  return jsonWithRetry(
    ask,
    async (messages) => {
      const call = async (format: object) => {
        try {
          return await openai.fetch(`${base}/chat/completions`, {
            method: "POST",
            headers: { "content-type": "application/json", ...(config.OPENAI_API_KEY ? { authorization: `Bearer ${config.OPENAI_API_KEY}` } : {}) },
            body: JSON.stringify({ model: config.OPENAI_MODEL, messages, temperature: 0.7, max_tokens: ask.maxTokens, response_format: format }),
          });
        } catch (err) {
          throw new Error(`Can't reach the model server at ${base} (${(err as Error).message}). Is it running, and is OPENAI_BASE_URL right?`);
        }
      };
      let res = await call(mode === "schema" ? { type: "json_schema", json_schema: { name: "answer", schema } } : { type: "json_object" });
      if (mode === "schema" && (res.status === 400 || res.status === 422)) {
        mode = "object"; // this server doesn't take schemas; ask for plain JSON and rely on validation
        res = await call({ type: "json_object" });
      }
      if (res.status === 401 || res.status === 403) throw new Error(`The model server at ${base} refused the key (${res.status}). Check OPENAI_API_KEY.`);
      if (res.status === 404) throw new Error(`The model server at ${base} doesn't know the model "${config.OPENAI_MODEL}" (404). Check OPENAI_MODEL and OPENAI_BASE_URL (it usually ends in /v1).`);
      if (!res.ok) throw new Error(`The model server returned ${res.status}: ${(await res.text()).slice(0, 500)}`);
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      const usage = body.usage ?? {};
      const costUsd = ((usage.prompt_tokens ?? 0) * config.OPENAI_USD_PER_1M_INPUT + (usage.completion_tokens ?? 0) * config.OPENAI_USD_PER_1M_OUTPUT) / 1_000_000;
      return { content: body.choices?.[0]?.message?.content ?? "", costUsd };
    },
    "A larger model usually fixes this (OPENAI_MODEL).",
  );
}
