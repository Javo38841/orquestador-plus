/** Tasks and projects (RF-02). Shared so main and renderer validate alike. */

export const TASK_TITLE_MAX_LENGTH = 200;
export const PROJECT_NAME_MAX_LENGTH = 60;

/** `in_progress` joins this list with the board story. */
export type TaskStatus = 'todo' | 'done';

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
  /** ISO-8601 UTC timestamp. */
  createdAt: string;
}

/** Fields the form sends. A new project is created by name together with the task. */
export interface TaskInput {
  title: string;
  dueDate: string | null;
  projectId: number | null;
  newProjectName?: string | null;
}

export type TaskError = 'empty' | 'too_long' | 'invalid_date' | 'invalid_project' | 'not_found';

export type TaskResult = { ok: true; task: Task } | { ok: false; error: TaskError };
export type ProjectResult = { ok: true; project: Project } | { ok: false; error: TaskError };

export interface ValidTaskInput {
  title: string;
  dueDate: string | null;
  projectId: number | null;
  newProjectName: string | null;
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

  return { ok: true, value: { title, dueDate, projectId, newProjectName } };
}

/** Today as a local `YYYY-MM-DD` date. */
export function localDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A pending task whose due date is before today. */
export function isOverdue(task: Pick<Task, 'status' | 'dueDate'>, today: string): boolean {
  return task.status === 'todo' && task.dueDate !== null && task.dueDate < today;
}
