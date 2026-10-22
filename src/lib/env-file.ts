import { existsSync, readFileSync, writeFileSync } from "node:fs";

// Sets KEY=value lines in .env, adding any that are missing. Used by the auth scripts.
export function writeEnv(values: Record<string, string>, path = ".env"): void {
  let text = existsSync(path) ? readFileSync(path, "utf8") : "";
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    text = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
  }
  writeFileSync(path, text);
}
