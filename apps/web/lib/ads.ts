/** Sample creatives until advertisers are signed up; each one is `ads.creatives.<key>` in both message files. */
export const AD_CREATIVES = ["brand", "shops", "colleges"] as const;

export type AdCreative = (typeof AD_CREATIVES)[number];

/** The same ticket or pass always shows the same creative, so server and client render alike. */
export function pickCreative(seed: string): AdCreative {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AD_CREATIVES[hash % AD_CREATIVES.length]!;
}
