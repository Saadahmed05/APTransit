import { describe, expect, it } from "vitest";
import { escapeCsvField, formatCsvWithBom } from "../src/modules/reports/csv-helper";

describe("CSV escaping and BOM formatting", () => {
  describe("escapeCsvField", () => {
    it("handles null and undefined", () => {
      expect(escapeCsvField(null)).toBe("");
      expect(escapeCsvField(undefined)).toBe("");
    });

    it("returns plain string without modification", () => {
      expect(escapeCsvField("hello")).toBe("hello");
      expect(escapeCsvField(123)).toBe("123");
    });

    it("escapes fields containing commas", () => {
      expect(escapeCsvField("Kurnool, AP")).toBe('"Kurnool, AP"');
    });

    it("escapes fields containing double quotes by doubling them", () => {
      expect(escapeCsvField('Bus "Express"')).toBe('"Bus ""Express"""');
    });

    it("escapes fields containing newlines", () => {
      expect(escapeCsvField("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
    });

    it("handles Telugu text with quotes or commas", () => {
      expect(escapeCsvField('కర్నూలు, "ఆంధ్రప్రదేశ్"')).toBe('"కర్నూలు, ""ఆంధ్రప్రదేశ్"""');
    });
  });

  describe("formatCsvWithBom", () => {
    it("prepends UTF-8 BOM", () => {
      const rows = [
        ["Header 1", "Header 2"],
        ["Val 1", "Val 2"],
      ];
      const output = formatCsvWithBom(rows);
      expect(output.startsWith("\uFEFF")).toBe(true);
      expect(output).toContain("Header 1,Header 2\r\nVal 1,Val 2\r\n");
    });
  });
});
