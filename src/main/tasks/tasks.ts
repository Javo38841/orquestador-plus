import type Database from 'better-sqlite3';
import {
  isTaskStatus,
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
  completed_at: string | null;
}

const SELECT_TASK = `
  SELECT t.id, t.title, t.status, t.due_date, t.project_id, p.name AS project_name, t.for_today, t.created_at, t.completed_at
  FROM tasks t LEFT JOIN projects p ON p.id = t.project_id`;

function toTask(row: TaskRow, tags: string[] = []): Task {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    dueDate: row.due_date,
    projectId: row.project_id,
    projectName: row.project_name,
    forToday: row.for_today === 1,
    tags,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function getTask(db: Database.Database, id: number): Task | null {
  const row = db.prepare(`${SELECT_TASK} WHERE t.id = ?`).get(id) as TaskRow | undefined;
  if (!row) return null;
  const tags = db
    .prepare(
      'SELECT g.name FROM task_tags tt JOIN tags g ON g.id = tt.tag_id WHERE tt.task_id = ? ORDER BY g.name',
    )
    .all(id) as { name: string }[];
  return toTask(
    row,
    tags.map((t) => t.name),
  );
}

/** Replaces the tag set of a task. Tags are stored once and related per task. */
function setTags(db: Database.Database, taskId: number, tags: string[]): void {
  db.prepare('DELETE FROM task_tags WHERE task_id = ?').run(taskId);
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  const link = db.prepare(
    'INSERT INTO task_tags (task_id, tag_id) SELECT ?, id FROM tags WHERE name = ?',
  );
  for (const tag of tags) {
    insertTag.run(tag);
    link.run(taskId, tag);
  }
}

/** Tags in use by at least one task, alphabetical. */
export function listTags(db: Database.Database): string[] {
  const rows = db
    .prepare(
      'SELECT DISTINCT g.name FROM tags g JOIN task_tags tt ON tt.tag_id = g.id ORDER BY g.name',
    )
    .all() as { name: string }[];
  return rows.map((r) => r.name);
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
    const taskId = Number(info.lastInsertRowid);
    setTags(db, taskId, value.tags);
    return taskId;
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
    setTags(db, id, value.tags);
  })();

  return { ok: true, task: getTask(db, id)! };
}

/** Moves a task between columns. Entering "done" stamps `completed_at`; leaving it clears it. */
export function setTaskStatus(
  db: Database.Database,
  id: unknown,
  status: unknown,
  now: Date = new Date(),
): TaskResult {
  if (!isTaskStatus(status)) return { ok: false, error: 'not_found' };
  const current = isId(id) ? getTask(db, id) : null;
  if (!current) return { ok: false, error: 'not_found' };
  const completedAt =
    status !== 'done' ? null : current.status === 'done' ? current.completedAt : now.toISOString();
  db.prepare('UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?').run(
    status,
    completedAt,
    id,
  );
  return { ok: true, task: getTask(db, id as number)! };
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
  const byTask = new Map<number, string[]>();
  const links = db
    .prepare(
      'SELECT tt.task_id, g.name FROM task_tags tt JOIN tags g ON g.id = tt.tag_id ORDER BY g.name',
    )
    .all() as { task_id: number; name: string }[];
  for (const link of links) {
    const list = byTask.get(link.task_id) ?? [];
    list.push(link.name);
    byTask.set(link.task_id, list);
  }
  return rows.map((row) => toTask(row, byTask.get(row.id)));
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
