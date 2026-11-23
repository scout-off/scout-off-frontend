// lib/sanitize.ts

export function sanitize(input: string): string {
  if (!input) return '';

  // Client-side: use DOMPurify to robustly strip any HTML. Call with
  // { ALLOWED_TAGS: [] } to remove all tags.
  if (typeof window !== 'undefined') {
    // Use require at runtime so server-side bundling doesn't attempt to call DOM APIs.
    const createDOMPurify = require('dompurify');
    const DOMPurify = createDOMPurify(window);
    return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
  }

  // Server-side fallback: simple regex to strip tags (no DOM dependency).
  // This intentionally strips tags only — it does not try to decode entities.
  return input.replace(/<[^>]*>/g, '');
}
