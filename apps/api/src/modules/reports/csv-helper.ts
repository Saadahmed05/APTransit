/** UTF-8 byte order mark: Excel needs it to read Telugu names correctly. */
export const CSV_BOM = "﻿";

/** Text starting with one of these runs as a formula in Excel and Sheets (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One CSV field (RFC 4180). Text that a spreadsheet would run as a formula gets a leading
 * apostrophe; numbers are written as they are, so negative values stay numbers.
 * Fields with commas, quotes or line breaks are quoted, inner quotes doubled.
 */
export function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  let str = String(val);
  if (typeof val === "string" && FORMULA_START.test(str)) str = `'${str}`;
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/** One CSV line with CRLF, as Excel expects. */
export function csvLine(fields: readonly unknown[]): string {
  return `${fields.map(escapeCsvField).join(",")}\r\n`;
}

/** Whole CSV with the BOM, for small outputs and tests. */
export function formatCsvWithBom(rows: ReadonlyArray<readonly unknown[]>): string {
  return CSV_BOM + rows.map(csvLine).join("");
}

/** Paise as rupees with two decimals, for spreadsheets. */
export function rupees(paise: number | bigint): string {
  return (Number(paise) / 100).toFixed(2);
}
