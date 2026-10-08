import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Reads tokens.css and checks the WCAG 2.2 AA ratios promised in prompts/v2-design-spec.md section 2:
// text at least 4.5, borders and icons at least 3. A colour edit that breaks a pair fails here.

const css = readFileSync(resolve(__dirname, "tokens.css"), "utf8");

function block(startMarker: string, endMarker: string): Record<string, string> {
  const start = css.indexOf(startMarker);
  const end = css.indexOf(endMarker, start);
  expect(start, `block ${startMarker}`).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const tokens: Record<string, string> = {};
  for (const match of css
    .slice(start, end)
    .matchAll(/^\s*--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6});/gm)) {
    tokens[match[1]!] = match[2]!;
  }
  return tokens;
}

const solids = block("/* ---------- Theme independent tokens", "--day-mon");
const light = { ...block(":root {\n  --map-line-width", "color-scheme: light;"), ...solids };
const darkSystem = {
  ...block("@media (prefers-color-scheme: dark)", "color-scheme: dark;"),
};
const darkChoice = block(':root[data-theme="dark"]', "color-scheme: dark;");

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const TONES = ["success", "info", "warning", "danger", "maintenance", "neutral"] as const;

function suite(name: string, tokens: Record<string, string>, onSolid: string) {
  const t = (key: string): string => {
    const value = tokens[key] ?? light[key];
    expect(value, `--${key} in ${name}`).toBeDefined();
    return value as string;
  };
  const text = (fg: string, bg: string, min = 4.5) =>
    expect(contrast(t(fg), t(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(min);

  describe(name, () => {
    it("defines the two new tokens", () => {
      expect(tokens["surface-sunken"]).toMatch(/^#/);
      expect(tokens["border-subtle"]).toMatch(/^#/);
    });

    it("body text passes AA on every surface", () => {
      for (const bg of ["bg", "surface", "surface-raised"]) {
        text("text", bg);
        text("text-muted", bg);
      }
      text("text-subtle", "surface-raised");
      text("text-subtle", "surface");
    });

    it("the accent passes AA", () => {
      text("primary", "surface-raised");
      text("primary", "primary-soft");
      expect(contrast(t("on-primary"), t("primary"))).toBeGreaterThanOrEqual(4.5);
    });

    it("input and focus borders reach 3 to 1", () => {
      text("border-strong", "surface-raised", 3);
      text("border-strong", "bg", 3);
    });

    for (const tone of TONES) {
      it(`${tone} text passes AA on its soft background`, () => {
        text(tone, `${tone}-soft`);
      });
    }

    it("solid status backgrounds carry white text", () => {
      for (const tone of TONES) {
        expect(contrast(onSolid, t(`${tone}-solid`)), `${tone}-solid`).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
}

suite("light", light, "#ffffff");
suite("dark by system", { ...light, ...darkSystem }, "#ffffff");
suite("dark by choice", { ...light, ...darkChoice }, "#ffffff");

describe("theme blocks stay in sync", () => {
  it("dark by system and dark by choice hold the same colours", () => {
    expect(darkSystem).toEqual(darkChoice);
  });
});
