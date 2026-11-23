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
  const sanitized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

  if (/[",\n\r]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}
