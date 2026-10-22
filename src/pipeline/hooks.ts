// Hook experiments: each video opens with one of a few hook styles. The agent keeps trying every style,
// then mostly uses whichever gets the most views, so over time it learns what opens best for this channel.

export const HOOK_STYLES = {
  question: "a direct question the viewer wants answered",
  "surprising-fact": "the single most surprising fact, stated flatly",
  "bold-claim": "a bold, slightly contrarian claim that the video then backs up",
  story: "the first line of a tiny story (a person, a moment, a place)",
  challenge: "a challenge to the viewer, e.g. 'you can't guess…' or 'most people get this wrong'",
} as const;

export type HookStyle = keyof typeof HOOK_STYLES;
export const isHookStyle = (s: unknown): s is HookStyle => typeof s === "string" && s in HOOK_STYLES;

export type HookStyleStats = { style: string; videos: number; avgViews: number };

const MIN_TRIES = 3; // videos per style before judging it
const EXPLORE = 0.2; // share of videos that keep testing other styles

export function chooseHookStyle(stats: HookStyleStats[], random: () => number = Math.random): HookStyle {
  const styles = Object.keys(HOOK_STYLES) as HookStyle[];
  const tries = (s: HookStyle) => stats.find((x) => x.style === s)?.videos ?? 0;
  const untested = styles.filter((s) => tries(s) < MIN_TRIES).sort((a, b) => tries(a) - tries(b));
  if (untested.length) return untested[0];
  if (random() < EXPLORE) return styles[Math.floor(random() * styles.length)];
  const best = stats.filter((x) => isHookStyle(x.style)).sort((a, b) => b.avgViews - a.avgViews)[0];
  return best.style as HookStyle;
}
