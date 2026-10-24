import { isBugSeverity, validateBugInput, type Bug, type BugError, type BugInput } from './bugs';
import type { Task, TaskError, TaskInput } from './tasks';
import type { Note, NoteError, NoteInput } from './wiki';

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

/** What an inbox item can become (RF-01). */
export const INBOX_CONVERT_TYPES = ['task', 'bug', 'note'] as const;
export type InboxConvertType = (typeof INBOX_CONVERT_TYPES)[number];

export function isInboxConvertType(value: unknown): value is InboxConvertType {
  return typeof value === 'string' && (INBOX_CONVERT_TYPES as readonly string[]).includes(value);
}

/** Payload of `inbox:convert`: the target type with the form of that type. */
export type InboxConversion =
  | { type: 'task'; input: TaskInput }
  | { type: 'bug'; input: BugInput }
  | { type: 'note'; input: NoteInput };

export type InboxConvertError = TaskError | BugError | NoteError;

export type InboxConvertResult =
  | { ok: true; type: 'task'; task: Task }
  | { ok: true; type: 'bug'; bug: Bug }
  | { ok: true; type: 'note'; note: Note }
  | { ok: false; error: InboxConvertError };

/**
 * Checks a bug form coming from the inbox panel: on top of the bug rules, the symptom, the impact and
 * the severity are required there (root cause and solution stay optional).
 */
export function validateInboxBug(input: unknown): { ok: true } | { ok: false; error: BugError } {
  const checked = validateBugInput(input);
  if (!checked.ok) return checked;
  const raw = input as Record<string, unknown>;
  if (!isBugSeverity(raw['severity'])) return { ok: false, error: 'invalid' };
  if (checked.symptom.length === 0 || checked.impact.length === 0) {
    return { ok: false, error: 'empty' };
  }
  return { ok: true };
}
