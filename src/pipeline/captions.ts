import type { Scene } from "./script.js";

export const WIDTH = 1080;
export const HEIGHT = 1920;
const WORDS_PER_CAPTION = 4;

export type TimedScene = Scene & { start: number; duration: number };

export function timeScenes(scenes: Scene[], durations: number[]): TimedScene[] {
  if (scenes.length !== durations.length) throw new Error("Each scene needs exactly one duration.");
  let start = 0;
  return scenes.map((scene, i) => {
    const timed = { ...scene, start, duration: durations[i] };
    start += durations[i];
    return timed;
  });
}

// Splits narration into short chunks, each shown for a share of the scene proportional to its length.
export function captionChunks(text: string, start: number, duration: number): { text: string; start: number; end: number }[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_CAPTION) chunks.push(words.slice(i, i + WORDS_PER_CAPTION).join(" "));
  const totalChars = chunks.reduce((n, c) => n + c.length, 0) || 1;

  let t = start;
  return chunks.map((c, i) => {
    const end = i === chunks.length - 1 ? start + duration : t + (duration * c.length) / totalChars;
    const chunk = { text: c, start: t, end };
    t = end;
    return chunk;
  });
}

// ASS timestamps are h:mm:ss.cc
export function assTime(seconds: number): string {
  const cs = Math.round(Math.max(0, seconds) * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

const escapeAss = (text: string) => text.replace(/\\/g, "").replace(/[{}]/g, "").replace(/\r?\n/g, "\\N");

// Captions sit above the bottom ~25% where Shorts/Reels draw their own buttons and text.
export function buildAss(scenes: TimedScene[]): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${WIDTH}
PlayResY: ${HEIGHT}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Title,DejaVu Sans,92,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,2,8,80,80,300,1
Style: Caption,DejaVu Sans,72,&H0000F0FF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,2,2,80,80,560,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines: string[] = [];
  for (const scene of scenes) {
    const end = scene.start + scene.duration;
    if (scene.on_screen_text) {
      lines.push(`Dialogue: 1,${assTime(scene.start)},${assTime(end)},Title,,0,0,0,,${escapeAss(scene.on_screen_text.toUpperCase())}`);
    }
    for (const c of captionChunks(scene.narration, scene.start, scene.duration)) {
      lines.push(`Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Caption,,0,0,0,,${escapeAss(c.text)}`);
    }
  }
  return header + lines.join("\n") + "\n";
}
