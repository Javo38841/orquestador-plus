/** Bug tracking (RF-09). Shared so main and renderer validate and filter alike. */

export const BUG_TITLE_MAX_LENGTH = 200;
export const BUG_TEXT_MAX_LENGTH = 10_000;

export const BUG_STATUSES = ['new', 'analysis', 'resolved', 'verified'] as const;
export type BugStatus = (typeof BUG_STATUSES)[number];

export const BUG_SEVERITIES = ['high', 'medium', 'low'] as const;
export type BugSeverity = (typeof BUG_SEVERITIES)[number];

export const DEFAULT_SEVERITY: BugSeverity = 'medium';

export type BugFilter = 'open' | 'resolved' | 'all';

export interface Bug {
  id: number;
  /** Display identifier, `BUG-<id>`. Ids are never reused. */
  code: string;
  title: string;
  symptom: string;
  impact: string;
  rootCause: string;
  solution: string;
  severity: BugSeverity;
  status: BugStatus;
  /** ISO-8601 UTC timestamps. */
  createdAt: string;
  updatedAt: string;
}

export interface BugInput {
  title: string;
  symptom: string;
  impact: string;
  rootCause: string;
  solution: string;
  severity: BugSeverity;
}

export type BugError = 'empty' | 'too_long' | 'invalid' | 'not_found';

export type BugResult = { ok: true; bug: Bug } | { ok: false; error: BugError };

export function isBugStatus(value: unknown): value is BugStatus {
  return typeof value === 'string' && (BUG_STATUSES as readonly string[]).includes(value);
}

export function isBugSeverity(value: unknown): value is BugSeverity {
  return typeof value === 'string' && (BUG_SEVERITIES as readonly string[]).includes(value);
}

export function bugCode(id: number): string {
  return `BUG-${id}`;
}

/** Open bugs are the ones still being worked on: new or under analysis. */
export function isOpenBug(bug: Pick<Bug, 'status'>): boolean {
  return bug.status === 'new' || bug.status === 'analysis';
}

export function filterBugs(bugs: Bug[], filter: BugFilter): Bug[] {
  if (filter === 'all') return bugs;
  return bugs.filter((b) => isOpenBug(b) === (filter === 'open'));
}

export function countOpenBugs(bugs: Bug[]): number {
  return bugs.filter(isOpenBug).length;
}

export type ValidBugInput = BugInput;

/** Trims and checks a bug form. Everything but the title may be empty; severity defaults to medium. */
export function validateBugInput(
  input: unknown,
): ({ ok: true } & ValidBugInput) | { ok: false; error: BugError } {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'invalid' };
  const raw = input as Record<string, unknown>;

  const text = (key: string): string | null => {
    const value = raw[key] ?? '';
    return typeof value === 'string' ? value.trim() : null;
  };
  const title = text('title');
  const symptom = text('symptom');
  const impact = text('impact');
  const rootCause = text('rootCause');
  const solution = text('solution');
  if (
    title === null ||
    symptom === null ||
    impact === null ||
    rootCause === null ||
    solution === null
  ) {
    return { ok: false, error: 'invalid' };
  }
  if (title.length === 0) return { ok: false, error: 'empty' };
  if (
    title.length > BUG_TITLE_MAX_LENGTH ||
    [symptom, impact, rootCause, solution].some((t) => t.length > BUG_TEXT_MAX_LENGTH)
  ) {
    return { ok: false, error: 'too_long' };
  }

  const severity = raw['severity'] ?? DEFAULT_SEVERITY;
  if (!isBugSeverity(severity)) return { ok: false, error: 'invalid' };

  return { ok: true, title, symptom, impact, rootCause, solution, severity };
}
