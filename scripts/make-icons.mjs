#!/usr/bin/env node
/**
 * Draws the PWA icons (docs/04: manifest plus a hand written service worker, no plugin):
 * a simple bus glyph in on-primary on the primary colour, as public/icons/icon.svg and the PNGs
 * icon-192.png, icon-512.png and maskable-512.png. Colours are read from packages/ui/src/tokens.css
 * so raw values still live in one file. Run: node scripts/make-icons.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tokens = readFileSync(join(root, "packages/ui/src/tokens.css"), "utf8");
const lightRoot = tokens.slice(tokens.indexOf(":root {"), tokens.indexOf("}", tokens.indexOf(":root {")));
const token = (name) => {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(lightRoot);
  if (!match) throw new Error(`token --${name} not found`);
  return match[1];
};
const BG = token("primary");
const FG = token("on-primary");
const rgb = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

/** The glyph on a 24 unit grid (lucide style bus, filled): [x, y, w, h, radius, colour]. */
const SHAPES = [
  [4, 3, 16, 16, 2.5, "fg"], // body
  [6, 5, 12, 6, 1, "bg"], // windscreen
  [6, 13, 3, 2, 1, "bg"], // left light
  [15, 13, 3, 2, 1, "bg"], // right light
  [5.5, 18, 3.5, 3, 1, "fg"], // left wheel
  [15, 18, 3.5, 3, 1, "fg"], // right wheel
];

function inRoundedRect(px, py, [x, y, w, h, r]) {
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

/** RGB pixels; the glyph fills `scale` of the icon (0.6 for maskable keeps it in the safe zone). */
function draw(size, scale) {
  const [bg, fg] = [rgb(BG), rgb(FG)];
  const pixels = Buffer.alloc(size * size * 3);
  const SS = 4; // supersampling for smooth edges
  const unit = (size * scale) / 24;
  const offset = (size - size * scale) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let fgHits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const gx = (x + (sx + 0.5) / SS - offset) / unit;
          const gy = (y + (sy + 0.5) / SS - offset) / unit;
          let colour = "bg";
          for (const shape of SHAPES) if (inRoundedRect(gx, gy, shape)) colour = shape[5];
          if (colour === "fg") fgHits++;
        }
      }
      const t = fgHits / (SS * SS);
      for (let c = 0; c < 3; c++) pixels[(y * size + x) * 3 + c] = Math.round(bg[c] * (1 - t) + fg[c] * t);
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(2, 9); // RGB
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) pixels.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

function svg() {
  const rects = SHAPES.map(([x, y, w, h, r, c]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${c === "fg" ? FG : BG}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="${BG}"/><g transform="translate(2.4 2.4) scale(0.8)">${rects}</g></svg>\n`;
}

const out = join(root, "apps/web/public/icons");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "icon.svg"), svg());
writeFileSync(join(out, "icon-192.png"), png(192, draw(192, 0.8)));
writeFileSync(join(out, "icon-512.png"), png(512, draw(512, 0.8)));
writeFileSync(join(out, "maskable-512.png"), png(512, draw(512, 0.6)));
console.log(`Icons written to ${out} (primary ${BG}, glyph ${FG})`);
