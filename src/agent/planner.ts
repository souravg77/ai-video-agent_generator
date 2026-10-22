import { z } from "zod/v4"; // structured output helpers need zod v4 schemas
import { askJson } from "../lib/llm.js";
import type { VideoFormat } from "../pipeline/captions.js";

export const IdeaSchema = z.object({
  topic: z.string().describe("The video's subject in a few words, e.g. 'why octopuses have three hearts'"),
  angle: z.string().describe("One sentence on the hook or take that makes this video worth watching"),
});
const PlanSchema = z.object({ ideas: z.array(IdeaSchema) });

export type Idea = z.infer<typeof IdeaSchema>;
export type PastVideo = { title: string; views?: number | null };

export type Planner = (count: number, past: PastVideo[]) => Promise<Idea[]>;

export type PlanOptions = { format?: VideoFormat; language?: string };

export function planningPrompt(niche: string, count: number, past: PastVideo[], opts: PlanOptions = {}): string {
  const history = past.length
    ? past.map((p) => `- ${p.title}${p.views != null ? ` (${p.views} views)` : ""}`).join("\n")
    : "(none yet)";
  const best = past
    .filter((p) => p.views)
    .sort((a, b) => b.views! - a.views!)
    .slice(0, 5);
  const winners = best.length >= 2 ? `\n\nBest performers so far (views across all platforms):\n${best.map((p) => `- ${p.title} (${p.views} views)`).join("\n")}` : "";
  return `Channel niche: ${niche}

Propose exactly ${count} new ${
    opts.format === "long"
      ? "YouTube video ideas (4-8 minute faceless horizontal videos with stock footage and voice-over, deep enough to hold attention that long)"
      : "short-video ideas (30-60 second faceless vertical videos with stock footage and voice-over)"
  }.${opts.language && opts.language.toLowerCase() !== "english" ? ` The audience speaks ${opts.language}; pick topics that appeal to them and write topic and angle in ${opts.language}.` : ""}
Each must be specific, factual, and easy to illustrate with stock footage. Do not repeat or closely paraphrase earlier videos.
Lean toward the kinds of topics and hooks that got more views, if view counts are shown. Newest videos have had the least time to gather views.

Earlier videos, newest first:
${history}${winners}`;
}

export function aiPlanner(niche: string, opts: PlanOptions = {}): Planner {
  return async (count, past) => {
    if (count <= 0) return [];
    const { data } = await askJson({ schema: PlanSchema, user: planningPrompt(niche, count, past, opts), maxTokens: 16000, what: "plan ideas for this niche" });
    return data.ideas.filter((i) => i.topic.trim()).slice(0, count);
  };
}
