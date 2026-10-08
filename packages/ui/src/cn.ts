import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge must know our custom token names, otherwise it treats text-h1 (a font size)
// and text-muted (a colour) as the same group and silently drops one of them.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display-lg", "display", "h1", "h2", "h3", "body-lg", "body", "small", "caption"],
      spacing: ["gutter"],
    },
    classGroups: {
      z: [{ z: ["sticky", "header", "overlay", "sheet", "dialog", "toast"] }],
      duration: [{ duration: ["fast", "base", "slow", "hold"] }],
    },
  },
});

/** Joins class names and lets the last Tailwind class win when two conflict. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
