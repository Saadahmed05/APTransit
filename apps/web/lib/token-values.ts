import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Raw colours live only in packages/ui/src/tokens.css (AGENTS.md rule 3). Places that must hold a
// colour value (the web manifest) read the light theme value from there on the server.
// Next runs from apps/web (next build, next start, Vercel root apps/web), so the file is two levels up.

const CANDIDATES = [join(process.cwd(), "../../packages/ui/src/tokens.css"), join(process.cwd(), "packages/ui/src/tokens.css")];

let lightRoot: string | null = null;

function readLightRoot(): string {
  if (lightRoot !== null) return lightRoot;
  const file = CANDIDATES.find((path) => existsSync(path));
  if (!file) throw new Error("packages/ui/src/tokens.css not found");
  const css = readFileSync(file, "utf8");
  const start = css.indexOf(":root {");
  lightRoot = css.slice(start, css.indexOf("}", start));
  return lightRoot;
}

/** The light theme value of a token, e.g. lightToken("primary") is "#1d4ed8". */
export function lightToken(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(readLightRoot());
  if (!match?.[1]) throw new Error(`Token --${name} not found in tokens.css`);
  return match[1];
}
