/**
 * Escapes a CSV field value against both RFC 4180 special characters and
 * formula injection (CWE-1236).
 *
 * Spreadsheet applications (Excel, LibreOffice, Google Sheets) treat a cell
 * that begins with `=`, `+`, `-`, `@`, `\t`, or `\r` as a formula. Prefixing
 * the value with a single-quote `'` forces the cell to be interpreted as plain
 * text — the strategy recommended by OWASP.
 */
export function escapeCsvValue(value: string): string {
  // A plain signed number (e.g. "-42", "+3.5") cannot be a formula, so it is
  // left as-is to keep numeric cells numeric.
  const isPlainNumber = /^[+-]?\d+(\.\d+)?$/.test(value);
  const sanitized =
    !isPlainNumber && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

  if (/[",\n\r]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}
