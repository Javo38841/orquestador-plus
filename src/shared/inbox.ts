/** Quick capture to the inbox (RF-01). Shared so main and renderer validate alike. */

export const CAPTURE_MAX_LENGTH = 500;

export type InboxSource = 'quick_capture' | 'portal';

export interface InboxItem {
  id: number;
  title: string;
  source: InboxSource;
  /** Who sent it, for items that came through the report portal (RF-15). */
  reporter?: string;
  /** ISO-8601 UTC timestamp. */
  createdAt: string;
}

export type CaptureError = 'empty' | 'too_long';

export type CaptureResult = { ok: true; item: InboxItem } | { ok: false; error: CaptureError };

/** Trims the text and checks it can be captured. */
export function validateCapture(
  text: unknown,
): { ok: true; title: string } | { ok: false; error: CaptureError } {
  const title = typeof text === 'string' ? text.trim() : '';
  if (title.length === 0) return { ok: false, error: 'empty' };
  if (title.length > CAPTURE_MAX_LENGTH) return { ok: false, error: 'too_long' };
  return { ok: true, title };
}
