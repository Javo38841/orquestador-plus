import type { Task, TaskStatus } from './tasks';

/** Kanban board (RF-04, RF-05): columns, filters and the "Hecho" window. */

export const BOARD_COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'done'];

/** "Hecho" only shows tasks completed within this many days. */
export const DONE_WINDOW_DAYS = 7;

const DAY_MS = 24 * 3600 * 1000;

/** Which board the Tablero shows: every task, only loose ones, or a single project. */
export type BoardSelection = 'general' | 'loose' | { projectId: number };

export const GENERAL_BOARD: BoardSelection = 'general';

/** Reads a stored setting value; an integer is a project, anything unknown is "General". */
export function parseBoardSelection(value: unknown): BoardSelection {
  if (value === 'loose') return 'loose';
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    const id = Number(value);
    if (Number.isSafeInteger(id)) return { projectId: id };
  }
  return GENERAL_BOARD;
}

/** True for exactly the values the main process accepts: 'general', 'loose' or `{ projectId: integer }`. */
export function isBoardSelection(value: unknown): value is BoardSelection {
  if (value === 'general' || value === 'loose') return true;
  if (typeof value !== 'object' || value === null) return false;
  const keys = Object.keys(value);
  return (
    keys.length === 1 &&
    keys[0] === 'projectId' &&
    Number.isSafeInteger((value as { projectId: unknown }).projectId)
  );
}

export interface BoardFilter {
  /** "General" shows every task, loose ones included. */
  board: BoardSelection;
  /** Null shows every tag. Combines with the project filter. */
  tag: string | null;
}

export type Board = Record<TaskStatus, Task[]>;

/** True when the task was completed no longer than `DONE_WINDOW_DAYS` ago. */
export function isRecentlyDone(task: Pick<Task, 'completedAt'>, now: Date): boolean {
  if (task.completedAt === null) return false;
  return now.getTime() - new Date(task.completedAt).getTime() <= DONE_WINDOW_DAYS * DAY_MS;
}

export function buildBoard(tasks: Task[], filter: BoardFilter, now: Date = new Date()): Board {
  const board: Board = { todo: [], in_progress: [], done: [] };
  for (const task of tasks) {
    if (filter.board === 'loose' && task.projectId !== null) continue;
    if (typeof filter.board === 'object' && task.projectId !== filter.board.projectId) continue;
    if (filter.tag !== null && !task.tags.includes(filter.tag)) continue;
    if (task.status === 'done' && !isRecentlyDone(task, now)) continue;
    board[task.status].push(task);
  }
  return board;
}
