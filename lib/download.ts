import 'client-only';

/**
 * Delay before releasing a Blob URL after the download anchor is clicked.
 *
 * Revoking synchronously right after `click()` can cancel the download in
 * Safari and older Firefox, because the navigation that starts the download
 * is dispatched asynchronously. A 1 s timeout gives every browser time to
 * pick up the URL while still releasing the memory promptly.
 */
export const REVOKE_DELAY_MS = 1000;

/** Strips path separators and control characters from a download filename. */
export function sanitizeFilename(filename: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = filename.replace(/[/\\\u0000-\u001f\u007f]/g, '').trim();
  return cleaned || 'download';
}

/** Triggers a browser download of `blob` under `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = sanitizeFilename(filename);
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/**
 * Downloads `content` as a UTF-8 CSV file. A byte-order mark is prepended so
 * Excel on Windows decodes accented names (e.g. "Kanté", "Ọlá") correctly.
 */
export function downloadCsv(content: string, filename: string): void {
  downloadBlob(
    new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' }),
    filename,
  );
}
