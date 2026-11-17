/**
 * Spreadsheet formula neutralization for staff exports (CSV / Excel).
 *
 * Text that starts with =, +, -, @ (optionally after whitespace or control
 * characters) is treated as a formula by Excel, Sheets and Numbers. Any such
 * value that came from people (names, notes, descriptions) is prefixed with a
 * single quote so it opens as plain text. Real numbers — including negative
 * refunds such as -1500 or "-1500.00" — are left untouched so sums still work.
 */
const FORMULA_START = /^[\s\u0000-\u001f]*[=+\-@]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export function neutralizeFormula<T>(value: T): T | string {
  if (typeof value !== "string") return value;
  if (!FORMULA_START.test(value) || PLAIN_NUMBER.test(value)) return value;
  return `'${value}`;
}

/** One RFC-4180 quoted CSV cell with formula neutralization. */
export function safeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const text = String(neutralizeFormula(typeof value === "string" ? value : String(value)));
  return `"${text.replace(/"/g, '""')}"`;
}

/** Build a CSV document from rows using safeCsvCell for every value. */
export function safeCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(safeCsvCell).join(",")).join("\n");
}
