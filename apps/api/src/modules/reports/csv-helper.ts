/**
 * Escapes a single value for CSV output according to RFC 4180.
 * If the value contains commas, quotes, or newlines, it is enclosed in double quotes,
 * and any internal quotes are doubled.
 */
export function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Converts an array of rows (each row being an array of values) into a CSV string.
 * Prepends the UTF-8 Byte Order Mark (\uFEFF) so Excel correctly recognizes UTF-8 (e.g. Telugu script).
 */
export function formatCsvWithBom(rows: Array<Array<unknown>>): string {
  const BOM = "\uFEFF";
  const body = rows.map((row) => row.map(escapeCsvField).join(",")).join("\r\n");
  return BOM + body + "\r\n";
}
