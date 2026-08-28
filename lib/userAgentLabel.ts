/**
 * Turns a raw `User-Agent` header into a short, human-readable "browser on
 * OS" label for the active-sessions view (issue #1187) — e.g.
 * "Chrome on macOS", "Safari on iPhone", "Firefox on Windows".
 *
 * Deliberately not a full UA-parsing dependency: session metadata
 * collection here is scoped conservatively (see docs/admin-audit-log.md's
 * precedent of documenting exactly what's stored and why) — a coarse
 * browser/OS label is enough for a user to recognize "is this session me,"
 * and pulling in a maintained UA database would be more precision than
 * that question needs.
 */
export function labelUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device';

  const ua = userAgent;

  let os = 'Unknown OS';
  if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Unknown browser';
  // Order matters: several browsers include "Safari" or "Chrome" tokens in
  // their own UA strings, so the more specific tokens must be checked first.
  if (/EdgA?\//i.test(ua)) browser = 'Edge';
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera';
  else if (/CriOS\//i.test(ua)) browser = 'Chrome';
  else if (/FxiOS\//i.test(ua)) browser = 'Firefox';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  return `${browser} on ${os}`;
}
