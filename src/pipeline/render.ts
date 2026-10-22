import { FRAME, type VideoFormat } from "./captions.js";
import { ffmpeg } from "../lib/ffmpeg.js";

export type RenderInput = {
  visuals: string[];
  voices: string[];
  durations: number[];
  assPath: string;
  outPath: string;
  musicPath?: string;
  musicVolume?: number;
  format?: VideoFormat;
};

// Escapes a path for use inside an FFmpeg filter argument.
const filterPath = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");

export function buildRenderArgs(input: RenderInput): string[] {
  const { visuals, voices, durations } = input;
  const n = visuals.length;
  const { width: W, height: H } = FRAME[input.format ?? "short"];
  if (voices.length !== n || durations.length !== n) throw new Error("visuals, voices and durations must have the same length");

  const args: string[] = [];
  for (const v of visuals) args.push("-stream_loop", "-1", "-i", v); // loop clips shorter than their scene
  for (const a of voices) args.push("-i", a);
  if (input.musicPath) args.push("-stream_loop", "-1", "-i", input.musicPath);

  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = durations[i].toFixed(3);
    parts.push(
      `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,setsar=1,trim=duration=${d},setpts=PTS-STARTPTS[v${i}]`,
      `[${n + i}:a]aresample=44100,aformat=channel_layouts=stereo,apad,atrim=duration=${d},asetpts=PTS-STARTPTS[a${i}]`,
    );
  }
  parts.push(`${Array.from({ length: n }, (_, i) => `[v${i}][a${i}]`).join("")}concat=n=${n}:v=1:a=1[vcat][acat]`);
  parts.push(`[vcat]subtitles='${filterPath(input.assPath)}'[vout]`);
  if (input.musicPath) {
    parts.push(`[${2 * n}:a]volume=${input.musicVolume ?? 0.12},aformat=channel_layouts=stereo[music]`);
    parts.push(`[acat][music]amix=inputs=2:duration=first:dropout_transition=0[aout]`);
  }

  const total = durations.reduce((a, b) => a + b, 0).toFixed(3);
  args.push(
    "-filter_complex", parts.join(";"),
    "-map", "[vout]", "-map", input.musicPath ? "[aout]" : "[acat]",
    "-t", total,
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "160k",
    "-movflags", "+faststart",
    input.outPath,
  );
  return args;
}

export async function renderVideo(input: RenderInput): Promise<void> {
  await ffmpeg(buildRenderArgs(input));
}
