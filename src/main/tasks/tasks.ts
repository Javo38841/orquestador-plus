import type Database from 'better-sqlite3';
import {
  fromRRule,
  isSeriesRule,
  nextDueDate,
  toRRule,
  type RecurrenceRule,
} from '../../shared/recurrence';
import {
  isTaskStatus,
  localDate,
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
  series_id: number | null;
  rrule: string | null;
}

const SELECT_TASK = `
  SELECT t.id, t.title, t.status, t.due_date, t.project_id, p.name AS project_name, t.for_today, t.created_at, t.completed_at,
         t.series_id, s.rrule
  FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN task_series s ON s.id = t.series_id`;

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
    seriesId: row.series_id,
    recurrence: (row.rrule && fromRRule(row.rrule)) || { kind: 'once' },
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

/** Stores the rule as a new series and returns its id. */
function insertSeries(db: Database.Database, rule: RecurrenceRule, now: Date): number | null {
  if (!isSeriesRule(rule)) return null;
  const info = db
    .prepare('INSERT INTO task_series (rrule, created_at) VALUES (?, ?)')
    .run(toRRule(rule), now.toISOString());
  return Number(info.lastInsertRowid);
}

/** Drops a series that has no open instance left (completed ones keep their history). */
function pruneSeries(db: Database.Database, seriesId: number | null): void {
  if (seriesId === null) return;
  const open = db
    .prepare("SELECT 1 FROM tasks WHERE series_id = ? AND status <> 'done'")
    .get(seriesId);
  if (!open) db.prepare('DELETE FROM task_series WHERE id = ?').run(seriesId);
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
        "INSERT INTO tasks (title, status, due_date, project_id, created_at, series_id) VALUES (?, 'todo', ?, ?, ?, ?)",
      )
      .run(
        value.title,
        value.dueDate,
        projectId,
        now.toISOString(),
        insertSeries(db, value.recurrence, now),
      );
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
  const existing = isId(id) ? getTask(db, id) : null;
  if (!existing) return { ok: false, error: 'not_found' };
  const checked = validateTaskInput(input);
  if (!checked.ok) return checked;
  const value = checked.value;
  if (value.projectId !== null && !value.newProjectName && !projectExists(db, value.projectId)) {
    return { ok: false, error: 'invalid_project' };
  }

  db.transaction(() => {
    const projectId = resolveProject(db, value, now);
    // A new rule applies to the open instance and to the ones generated from now on;
    // completed instances do not store a rule, so they are untouched.
    let seriesId = existing.seriesId;
    if (!isSeriesRule(value.recurrence)) {
      seriesId = null;
    } else if (seriesId === null) {
      seriesId = insertSeries(db, value.recurrence, now);
    } else {
      db.prepare('UPDATE task_series SET rrule = ? WHERE id = ?').run(
        toRRule(value.recurrence),
        seriesId,
      );
    }
    db.prepare(
      'UPDATE tasks SET title = ?, due_date = ?, project_id = ?, series_id = ? WHERE id = ?',
    ).run(value.title, value.dueDate, projectId, seriesId, existing.id);
    setTags(db, existing.id, value.tags);
    if (seriesId !== existing.seriesId) pruneSeries(db, existing.seriesId);
  })();

  return { ok: true, task: getTask(db, existing.id)! };
}

/** Creates the next instance of the series from a just-completed one. */
function spawnNextInstance(db: Database.Database, done: Task, now: Date): void {
  if (done.seriesId === null || !isSeriesRule(done.recurrence)) return;
  const open = db
    .prepare("SELECT 1 FROM tasks WHERE series_id = ? AND status <> 'done'")
    .get(done.seriesId);
  if (open) return;
  const due = nextDueDate(done.recurrence, done.dueDate, localDate(now));
  const info = db
    .prepare(
      "INSERT INTO tasks (title, status, due_date, project_id, created_at, series_id) VALUES (?, 'todo', ?, ?, ?, ?)",
    )
    .run(done.title, due, done.projectId, now.toISOString(), done.seriesId);
  setTags(db, Number(info.lastInsertRowid), done.tags);
}

/**
 * Reopening an instance whose successor already exists must not leave two open instances:
 * an untouched successor is dropped (completing again regenerates it); a successor already
 * in progress wins and the reopened task leaves the series.
 */
function resolveReopened(db: Database.Database, reopened: Task): void {
  if (reopened.seriesId === null) return;
  const sibling = db
    .prepare("SELECT id, status FROM tasks WHERE series_id = ? AND status <> 'done' AND id <> ?")
    .get(reopened.seriesId, reopened.id) as { id: number; status: TaskStatus } | undefined;
  if (!sibling) return;
  if (sibling.status === 'todo') {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(sibling.id);
  } else {
    db.prepare('UPDATE tasks SET series_id = NULL WHERE id = ?').run(reopened.id);
  }
}

/**
 * Moves a task between columns. Entering "done" stamps `completed_at` and, for a series
 * instance, creates the next one in the same transaction; leaving it clears the stamp.
 */
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
  db.transaction(() => {
    db.prepare('UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?').run(
      status,
      completedAt,
      current.id,
    );
    if (status === 'done' && current.status !== 'done') spawnNextInstance(db, current, now);
    if (status !== 'done' && current.status === 'done') resolveReopened(db, current);
  })();
  return { ok: true, task: getTask(db, current.id)! };
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
  const task = isId(id) ? getTask(db, id) : null;
  if (!task) return false;
  db.transaction(() => {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
    pruneSeries(db, task.seriesId);
  })();
  return true;
}

/**
 * Deletes a series with its open instance; completed instances stay as history
 * (their series link is cleared by ON DELETE SET NULL). Returns whether it existed.
 */
export function deleteSeries(db: Database.Database, seriesId: unknown): boolean {
  if (!isId(seriesId)) return false;
  return db.transaction(() => {
    db.prepare("DELETE FROM tasks WHERE series_id = ? AND status <> 'done'").run(seriesId);
    return db.prepare('DELETE FROM task_series WHERE id = ?').run(seriesId).changes > 0;
  })();
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
