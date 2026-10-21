/** Tasks and projects (RF-02). Shared so main and renderer validate alike. */

import {
  isSeriesRule,
  validateRecurrence,
  type RecurrenceError,
  type RecurrenceRule,
} from './recurrence';
import { validateReminder, type ReminderError } from './reminders';

export const TASK_TITLE_MAX_LENGTH = 200;
export const PROJECT_NAME_MAX_LENGTH = 60;
export const TAG_MAX_LENGTH = 30;

export type TaskStatus = 'todo' | 'in_progress' | 'done';

export const TASK_STATUSES: readonly TaskStatus[] = ['todo', 'in_progress', 'done'];

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value);
}

export interface Project {
  id: number;
  name: string;
}

export interface Task {
  id: number;
  title: string;
  status: TaskStatus;
  /** Local calendar date `YYYY-MM-DD`, or null. */
  dueDate: string | null;
  /** Null means "Suelta" (no project). */
  projectId: number | null;
  projectName: string | null;
  /** Marked by the user to be done today (shows in Hoy even without a due date). */
  forToday: boolean;
  /** Normalized tags (lowercase, no leading `#`), alphabetical. */
  tags: string[];
  /** ISO-8601 UTC timestamp. */
  createdAt: string;
  /** ISO-8601 UTC timestamp of when it was moved to done; null while not done. */
  completedAt: string | null;
  /** Series (RF-06) this task is an instance of, or null. */
  seriesId: number | null;
  /** Repetition rule of the series; `{ kind: 'once' }` when the task is not in a series. */
  recurrence: RecurrenceRule;
  /** Local `YYYY-MM-DDTHH:mm` at which to notify (RF-18), or null. */
  reminderAt: string | null;
  /** ISO-8601 UTC timestamp of when the reminder fired; null while it has not. */
  reminderNotifiedAt: string | null;
}

/** Fields the form sends. A new project is created by name together with the task. */
export interface TaskInput {
  title: string;
  dueDate: string | null;
  projectId: number | null;
  newProjectName?: string | null;
  /** Raw tags as typed; main normalizes them. Omitted means no tags. */
  tags?: string[];
  /** Repetition rule. Omitted or `once` means a plain task. */
  recurrence?: RecurrenceRule | null;
  /** Local `YYYY-MM-DDTHH:mm` reminder. Omitted or null means no reminder. */
  reminderAt?: string | null;
}

export type TagError = 'tag_empty' | 'tag_too_long' | 'tag_spaces';

export type TaskError =
  | 'empty'
  | 'too_long'
  | 'invalid_date'
  | 'invalid_project'
  | 'not_found'
  | TagError
  | RecurrenceError
  | ReminderError;

export type TaskResult = { ok: true; task: Task } | { ok: false; error: TaskError };
export type ProjectResult = { ok: true; project: Project } | { ok: false; error: TaskError };

export interface ValidTaskInput {
  title: string;
  dueDate: string | null;
  projectId: number | null;
  newProjectName: string | null;
  tags: string[];
  recurrence: RecurrenceRule;
  reminderAt: string | null;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(value: string): boolean {
  const m = DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Validates a project name; returns the trimmed name or the error. */
export function validateProjectName(
  name: unknown,
): { ok: true; name: string } | { ok: false; error: TaskError } {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length === 0) return { ok: false, error: 'empty' };
  if (trimmed.length > PROJECT_NAME_MAX_LENGTH) return { ok: false, error: 'too_long' };
  return { ok: true, name: trimmed };
}

/** Lowercases and strips the leading `#`: "Infra", "#infra" and "infra" are the same tag. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').trim().toLowerCase();
}

/** Validates one tag; returns its normalized form or the error. */
export function validateTag(
  raw: unknown,
): { ok: true; tag: string } | { ok: false; error: TagError } {
  const tag = typeof raw === 'string' ? normalizeTag(raw) : '';
  if (tag.length === 0) return { ok: false, error: 'tag_empty' };
  if (/\s/.test(tag)) return { ok: false, error: 'tag_spaces' };
  if (tag.length > TAG_MAX_LENGTH) return { ok: false, error: 'tag_too_long' };
  return { ok: true, tag };
}

/** Normalizes a list of tags, dropping duplicates; fails on the first invalid one. */
export function validateTags(
  raw: unknown,
): { ok: true; tags: string[] } | { ok: false; error: TagError | 'invalid_tags' } {
  if (raw === undefined || raw === null) return { ok: true, tags: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'invalid_tags' };
  const tags = new Set<string>();
  for (const item of raw) {
    const checked = validateTag(item);
    if (!checked.ok) return checked;
    tags.add(checked.tag);
  }
  return { ok: true, tags: [...tags].sort() };
}

/** Existing tags that start with what the user is typing, excluding the ones already chosen. */
export function suggestTags(known: string[], typed: string, chosen: string[] = []): string[] {
  const prefix = normalizeTag(typed);
  if (prefix.length === 0) return [];
  return known.filter((t) => t.startsWith(prefix) && t !== prefix && !chosen.includes(t));
}

/** Trims and checks the form payload (unknown because it comes over IPC). */
export function validateTaskInput(
  input: unknown,
): { ok: true; value: ValidTaskInput } | { ok: false; error: TaskError } {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;

  const title = typeof raw['title'] === 'string' ? raw['title'].trim() : '';
  if (title.length === 0) return { ok: false, error: 'empty' };
  if (title.length > TASK_TITLE_MAX_LENGTH) return { ok: false, error: 'too_long' };

  const due = raw['dueDate'];
  let dueDate: string | null = null;
  if (due !== null && due !== undefined && due !== '') {
    if (typeof due !== 'string' || !isValidDate(due)) return { ok: false, error: 'invalid_date' };
    dueDate = due;
  }

  const project = raw['projectId'];
  let projectId: number | null = null;
  if (project !== null && project !== undefined) {
    if (typeof project !== 'number' || !Number.isInteger(project)) {
      return { ok: false, error: 'invalid_project' };
    }
    projectId = project;
  }

  let newProjectName: string | null = null;
  const fresh = raw['newProjectName'];
  if (fresh !== null && fresh !== undefined && fresh !== '') {
    const checked = validateProjectName(fresh);
    if (!checked.ok) return { ok: false, error: 'invalid_project' };
    newProjectName = checked.name;
  }

  const tags = validateTags(raw['tags']);
  if (!tags.ok)
    return { ok: false, error: tags.error === 'invalid_tags' ? 'tag_empty' : tags.error };

  const recurrence = validateRecurrence(raw['recurrence']);
  if (!recurrence.ok) return recurrence;
  if (isSeriesRule(recurrence.rule) && dueDate === null) {
    return { ok: false, error: 'recurrence_due_required' };
  }

  const reminder = validateReminder(raw['reminderAt']);
  if (!reminder.ok) return reminder;
  if (reminder.reminderAt !== null && isSeriesRule(recurrence.rule)) {
    return { ok: false, error: 'reminder_series' };
  }

  return {
    ok: true,
    value: {
      title,
      dueDate,
      projectId,
      newProjectName,
      tags: tags.tags,
      recurrence: recurrence.rule,
      reminderAt: reminder.reminderAt,
    },
  };
}

/** Today as a local `YYYY-MM-DD` date. */
export function localDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** An unfinished task (to do or in progress) whose due date is before today. */
export function isOverdue(task: Pick<Task, 'status' | 'dueDate'>, today: string): boolean {
  return task.status !== 'done' && task.dueDate !== null && task.dueDate < today;
}
