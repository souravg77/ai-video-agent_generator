import { writeFile } from "node:fs/promises";
import { ffmpeg } from "../lib/ffmpeg.js";
import { assTime } from "./captions.js";

const escapeAss = (text: string) => text.replace(/\\/g, "").replace(/[{}]/g, "").replace(/\r?\n/g, " ");

// A 1280x720 YouTube thumbnail: a frame from the opening footage with big outlined text.
export function thumbnailAss(text: string, font = "DejaVu Sans"): string {
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Thumb,${font.replace(/,/g, "")},112,&H0000F0FF,&H00FFFFFF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,9,4,5,70,70,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,${assTime(0)},${assTime(60)},Thumb,,0,0,0,,${escapeAss(text.toUpperCase())}
`;
}

export async function makeThumbnail(opts: { visualPath: string; text: string; assPath: string; outPath: string; font?: string }): Promise<void> {
  await writeFile(opts.assPath, thumbnailAss(opts.text, opts.font));
  const ass = opts.assPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  await ffmpeg([
    "-ss", "1", "-i", opts.visualPath,
    "-frames:v", "1",
    "-vf", `scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,eq=brightness=-0.08,subtitles='${ass}'`,
    "-q:v", "3",
    opts.outPath,
  ]);
}
