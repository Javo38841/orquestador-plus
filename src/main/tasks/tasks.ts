import type Database from 'better-sqlite3';
import {
  validateProjectName,
  validateTaskInput,
  type Project,
  type ProjectResult,
  type Task,
  type TaskResult,
  type TaskStatus,
  type ValidTaskInput,
} from '../../shared/tasks';

interface TaskRow {
  id: number;
  title: string;
  status: TaskStatus;
  due_date: string | null;
  project_id: number | null;
  project_name: string | null;
  for_today: number;
  created_at: string;
}

const SELECT_TASK = `
  SELECT t.id, t.title, t.status, t.due_date, t.project_id, p.name AS project_name, t.for_today, t.created_at
  FROM tasks t LEFT JOIN projects p ON p.id = t.project_id`;

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    dueDate: row.due_date,
    projectId: row.project_id,
    projectName: row.project_name,
    forToday: row.for_today === 1,
    createdAt: row.created_at,
  };
}

function getTask(db: Database.Database, id: number): Task | null {
  const row = db.prepare(`${SELECT_TASK} WHERE t.id = ?`).get(id) as TaskRow | undefined;
  return row ? toTask(row) : null;
}

function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/** Returns the id of the project to use: a new one (or the existing one with that name) or the chosen one. */
function resolveProject(db: Database.Database, input: ValidTaskInput, now: Date): number | null {
  if (input.newProjectName) {
    const existing = db
      .prepare('SELECT id FROM projects WHERE name = ? COLLATE NOCASE')
      .get(input.newProjectName) as { id: number } | undefined;
    if (existing) return existing.id;
    const info = db
      .prepare('INSERT INTO projects (name, created_at) VALUES (?, ?)')
      .run(input.newProjectName, now.toISOString());
    return Number(info.lastInsertRowid);
  }
  return input.projectId;
}

function projectExists(db: Database.Database, id: number): boolean {
  return db.prepare('SELECT 1 FROM projects WHERE id = ?').get(id) !== undefined;
}

/** Creates a task, and its project when the form names a new one, in one transaction. */
export function createTask(
  db: Database.Database,
  input: unknown,
  now: Date = new Date(),
): TaskResult {
  const checked = validateTaskInput(input);
  if (!checked.ok) return checked;
  const value = checked.value;
  if (value.projectId !== null && !value.newProjectName && !projectExists(db, value.projectId)) {
    return { ok: false, error: 'invalid_project' };
  }

  const id = db.transaction(() => {
    const projectId = resolveProject(db, value, now);
    const info = db
      .prepare(
        "INSERT INTO tasks (title, status, due_date, project_id, created_at) VALUES (?, 'todo', ?, ?, ?)",
      )
      .run(value.title, value.dueDate, projectId, now.toISOString());
    return Number(info.lastInsertRowid);
  })();

  return { ok: true, task: getTask(db, id)! };
}

/** Edits title, due date and project of an existing task. */
export function updateTask(
  db: Database.Database,
  id: unknown,
  input: unknown,
  now: Date = new Date(),
): TaskResult {
  if (!isId(id) || !getTask(db, id)) return { ok: false, error: 'not_found' };
  const checked = validateTaskInput(input);
  if (!checked.ok) return checked;
  const value = checked.value;
  if (value.projectId !== null && !value.newProjectName && !projectExists(db, value.projectId)) {
    return { ok: false, error: 'invalid_project' };
  }

  db.transaction(() => {
    const projectId = resolveProject(db, value, now);
    db.prepare('UPDATE tasks SET title = ?, due_date = ?, project_id = ? WHERE id = ?').run(
      value.title,
      value.dueDate,
      projectId,
      id,
    );
  })();

  return { ok: true, task: getTask(db, id)! };
}

export function setTaskStatus(db: Database.Database, id: unknown, status: unknown): TaskResult {
  if (status !== 'todo' && status !== 'done') return { ok: false, error: 'not_found' };
  if (!isId(id) || !getTask(db, id)) return { ok: false, error: 'not_found' };
  db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, id);
  return { ok: true, task: getTask(db, id)! };
}

/** Marks or unmarks a task as "para hoy". */
export function setTaskForToday(db: Database.Database, id: unknown, forToday: unknown): TaskResult {
  if (typeof forToday !== 'boolean') return { ok: false, error: 'not_found' };
  if (!isId(id) || !getTask(db, id)) return { ok: false, error: 'not_found' };
  db.prepare('UPDATE tasks SET for_today = ? WHERE id = ?').run(forToday ? 1 : 0, id);
  return { ok: true, task: getTask(db, id)! };
}

/** Returns whether a task was deleted. */
export function deleteTask(db: Database.Database, id: unknown): boolean {
  if (!isId(id)) return false;
  return db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0;
}

/** Tasks, pending first, then by due date (undated last) and creation. */
export function listTasks(db: Database.Database): Task[] {
  const rows = db
    .prepare(
      `${SELECT_TASK}
       ORDER BY (t.status = 'done'), t.due_date IS NULL, t.due_date, t.created_at DESC, t.id DESC`,
    )
    .all() as TaskRow[];
  return rows.map(toTask);
}

export function listProjects(db: Database.Database): Project[] {
  return db
    .prepare('SELECT id, name FROM projects ORDER BY name COLLATE NOCASE')
    .all() as Project[];
}

export function createProject(
  db: Database.Database,
  name: unknown,
  now: Date = new Date(),
): ProjectResult {
  const checked = validateProjectName(name);
  if (!checked.ok) return checked;
  const existing = db
    .prepare('SELECT id, name FROM projects WHERE name = ? COLLATE NOCASE')
    .get(checked.name) as Project | undefined;
  if (existing) return { ok: true, project: existing };
  const info = db
    .prepare('INSERT INTO projects (name, created_at) VALUES (?, ?)')
    .run(checked.name, now.toISOString());
  return { ok: true, project: { id: Number(info.lastInsertRowid), name: checked.name } };
}

/** Deletes a project; its tasks stay and become loose (ON DELETE SET NULL). */
export function deleteProject(db: Database.Database, id: unknown): boolean {
  if (!isId(id)) return false;
  return db.prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0;
}
