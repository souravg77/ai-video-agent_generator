import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4"; // the SDK's zodOutputFormat helper needs zod v4 schemas
import { config } from "../config.js";

export const IdeaSchema = z.object({
  topic: z.string().describe("The video's subject in a few words, e.g. 'why octopuses have three hearts'"),
  angle: z.string().describe("One sentence on the hook or take that makes this video worth watching"),
});
const PlanSchema = z.object({ ideas: z.array(IdeaSchema) });

export type Idea = z.infer<typeof IdeaSchema>;
export type PastVideo = { title: string; views?: number | null };

export type Planner = (count: number, past: PastVideo[]) => Promise<Idea[]>;

export function planningPrompt(niche: string, count: number, past: PastVideo[]): string {
  const history = past.length
    ? past.map((p) => `- ${p.title}${p.views != null ? ` (${p.views} views)` : ""}`).join("\n")
    : "(none yet)";
  const best = past
    .filter((p) => p.views)
    .sort((a, b) => b.views! - a.views!)
    .slice(0, 5);
  const winners = best.length >= 2 ? `\n\nBest performers so far (views across all platforms):\n${best.map((p) => `- ${p.title} (${p.views} views)`).join("\n")}` : "";
  return `Channel niche: ${niche}

Propose exactly ${count} new short-video ideas (30-60 second faceless vertical videos with stock footage and voice-over).
Each must be specific, factual, and easy to illustrate with stock footage. Do not repeat or closely paraphrase earlier videos.
Lean toward the kinds of topics and hooks that got more views, if view counts are shown. Newest videos have had the least time to gather views.

Earlier videos, newest first:
${history}${winners}`;
}

export function claudePlanner(niche: string, client = new Anthropic()): Planner {
  return async (count, past) => {
    if (count <= 0) return [];
    const response = await client.messages.parse({
      model: config.CLAUDE_MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium", format: zodOutputFormat(PlanSchema) },
      messages: [{ role: "user", content: planningPrompt(niche, count, past) }],
    });
    if (response.stop_reason === "refusal") throw new Error("Claude declined to plan ideas for this niche.");
    if (!response.parsed_output) throw new Error("Claude's plan did not match the expected format.");
    return response.parsed_output.ideas.filter((i) => i.topic.trim()).slice(0, count);
  };
}
