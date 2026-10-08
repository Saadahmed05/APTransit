// Lists className tokens used in apps/web and packages/ui that do not exist in the built CSS.
// Tailwind silently drops unknown utilities, so these are styles that never apply. Run after
// `pnpm --filter web build`: `pnpm check:classes`. Ids, locales and CSS variables also show up; ignore them.
const fs = require("fs");
const path = require("path");

const cssDir = "apps/web/.next/static/chunks";
const css = fs
  .readdirSync(cssDir, { recursive: true })
  .filter((f) => String(f).endsWith(".css"))
  .map((f) => fs.readFileSync(path.join(cssDir, String(f)), "utf8"))
  .join("\n");
const defined = new Set();
for (const m of css.matchAll(/\.((?:[\w-]|\\.)+)/g)) defined.add(m[1].replace(/\\(.)/g, "$1"));

const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (!/node_modules|\.next|e2e/.test(p)) walk(p);
    } else if (/\.tsx$/.test(e.name)) files.push(p);
  }
};
["apps/web/app", "apps/web/components", "packages/ui/src"].forEach(walk);

const missing = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/(?:className=\{?|cn\(|: |\? )["`]([^"`]+)["`]/g)) {
    for (const c of m[1].split(/\s+/)) {
      if (!c || c.includes("$") || c.includes("{") || c.includes("/") && !/^[\w:-]+\/\d+$/.test(c)) continue;
      const base = c.replace(/^([\w[\]&:-]+:)+/, "");
      if (!/^-?[a-z]/.test(base) || ["group", "peer", "sr-only"].includes(base)) continue;
      if (!/[-]/.test(base) && !["flex", "grid", "block", "hidden", "inline", "contents", "border", "rounded", "shadow", "truncate", "italic", "underline", "relative", "absolute", "fixed", "sticky", "static", "grow", "shrink"].includes(base)) continue;
      if (!defined.has(c)) {
        if (!missing.has(c)) missing.set(c, new Set());
        missing.get(c).add(path.relative(".", f).replace(/\\/g, "/"));
      }
    }
  }
}
const rows = [...missing.entries()].sort((a, b) => a[0].localeCompare(b[0]));
console.log(`${rows.length} classes not in the built CSS`);
for (const [c, where] of rows) console.log(c.padEnd(36), [...where].slice(0, 3).join(", "));
