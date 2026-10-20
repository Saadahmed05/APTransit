import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import te from "../messages/te.json";
import { AD_CREATIVES, pickCreative } from "./ads";

describe("ads", () => {
  it("has a title and body for every creative in English and Telugu", () => {
    for (const messages of [en, te]) {
      expect(messages.ads.label).toBeTruthy();
      for (const key of AD_CREATIVES) {
        expect(messages.ads.creatives[key].title).toBeTruthy();
        expect(messages.ads.creatives[key].body).toBeTruthy();
      }
    }
  });

  it("picks the same creative for the same seed and spreads seeds over all creatives", () => {
    expect(pickCreative("ticket-1")).toBe(pickCreative("ticket-1"));
    const seen = new Set(Array.from({ length: 30 }, (_, i) => pickCreative(`seed-${i}`)));
    expect(seen.size).toBe(AD_CREATIVES.length);
  });
});
