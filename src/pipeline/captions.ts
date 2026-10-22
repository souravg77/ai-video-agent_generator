import type { Scene } from "./script.js";

// short: 9:16 for Shorts and Reels. long: 16:9 for regular YouTube videos.
export type VideoFormat = "short" | "long";
export const FRAME: Record<VideoFormat, { width: number; height: number }> = {
  short: { width: 1080, height: 1920 },
  long: { width: 1920, height: 1080 },
};
const WORDS_PER_CAPTION = 4;
const CHARS_PER_CAPTION = 10; // for languages written without spaces

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
  if (words.length === 1 && [...words[0]].length > CHARS_PER_CAPTION * 1.5) {
    // Chinese, Japanese, Thai etc. have no spaces between words; split by characters instead.
    const chars = [...words[0]];
    for (let i = 0; i < chars.length; i += CHARS_PER_CAPTION) chunks.push(chars.slice(i, i + CHARS_PER_CAPTION).join(""));
  } else {
    for (let i = 0; i < words.length; i += WORDS_PER_CAPTION) chunks.push(words.slice(i, i + WORDS_PER_CAPTION).join(" "));
  }
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

// Shorts: captions sit above the bottom ~25% where Shorts/Reels draw their own buttons and text.
// Long: a smaller title top-left-ish and subtitles near the bottom, like regular YouTube videos.
export function buildAss(scenes: TimedScene[], opts: { format?: VideoFormat; font?: string } = {}): string {
  const format = opts.format ?? "short";
  const { width, height } = FRAME[format];
  const font = (opts.font ?? "DejaVu Sans").replace(/,/g, "");
  const styles =
    format === "short"
      ? `Style: Title,${font},92,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,2,8,80,80,300,1
Style: Caption,${font},72,&H0000F0FF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,2,2,80,80,560,1`
      : `Style: Title,${font},64,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,8,120,120,70,1
Style: Caption,${font},56,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,160,160,70,1`;
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styles}

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
