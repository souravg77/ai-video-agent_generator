import { spawn } from "node:child_process";
import { config } from "../config.js";

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => reject(new Error(`Could not start ${bin}: ${e.message}. Is FFmpeg installed?`)));
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${bin} exited with ${code}:\n${err.split("\n").slice(-15).join("\n")}`));
    });
  });
}

export const ffmpeg = (args: string[]) => run(config.FFMPEG_PATH, ["-hide_banner", "-loglevel", "error", "-y", ...args]);

export async function probeDuration(file: string): Promise<number> {
  const out = await run(config.FFPROBE_PATH, [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file,
  ]);
  const seconds = Number.parseFloat(out.trim());
  if (!Number.isFinite(seconds)) throw new Error(`Could not read duration of ${file}`);
  return seconds;
}
