import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { openDatabase } from '../db/database';
import { migrate, migrations } from '../db/migrations';
import { localDate, PROJECT_NAME_MAX_LENGTH } from '../../shared/tasks';
import {
  createProject,
  createTask,
  deleteProject,
  deleteSeries,
  deleteTask,
  listProjects,
  listTags,
  listTasks,
  setTaskForToday,
  setTaskStatus,
  updateTask,
} from './tasks';

describe('tasks', () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-tasks-'));
    db = openDatabase(dir);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const make = (title: string, extra: object = {}) => {
    const result = createTask(db, { title, dueDate: null, projectId: null, ...extra });
    if (!result.ok) throw new Error(result.error);
    return result.task;
  };

  it('CP-02-01: a task without project is created pending and loose', () => {
    const task = make('Llamar al dentista');
    expect(task).toMatchObject({
      title: 'Llamar al dentista',
      status: 'todo',
      projectId: null,
      projectName: null,
      dueDate: null,
      forToday: false,
    });
    expect(listTasks(db)).toHaveLength(1);
  });

  it('CP-02-02: a project created with the task is attached to it', () => {
    const task = make('Revisar rate limit', { newProjectName: ' api-gateway ' });
    expect(task.projectName).toBe('api-gateway');
    expect(listProjects(db).map((p) => p.name)).toEqual(['api-gateway']);

    const second = make('Otra', { newProjectName: 'API-Gateway' });
    expect(second.projectId).toBe(task.projectId);
    expect(listProjects(db)).toHaveLength(1);
  });

  it('CP-02-03: editing title and due date persists across reopening', () => {
    const task = make('Viejo');
    const result = updateTask(db, task.id, {
      title: 'Nuevo',
      dueDate: '2026-04-01',
      projectId: null,
    });
    expect(result).toMatchObject({ ok: true, task: { title: 'Nuevo', dueDate: '2026-04-01' } });

    db.close();
    db = openDatabase(dir);
    expect(listTasks(db)[0]).toMatchObject({ title: 'Nuevo', dueDate: '2026-04-01' });
  });

  it('CP-02-03: editing can move a task to a project and back to loose', () => {
    const project = createProject(db, 'web');
    if (!project.ok) throw new Error();
    const task = make('t');
    const moved = updateTask(db, task.id, { title: 't', projectId: project.project.id });
    expect(moved).toMatchObject({ ok: true, task: { projectName: 'web' } });
    const loose = updateTask(db, task.id, { title: 't', projectId: null });
    expect(loose).toMatchObject({ ok: true, task: { projectId: null } });
  });

  it('CP-04-07: createProject rejects empty, blank and too long names', () => {
    for (const name of ['', '   ', 'x'.repeat(PROJECT_NAME_MAX_LENGTH + 1)]) {
      expect(createProject(db, name).ok).toBe(false);
    }
    expect(createProject(db, 'x'.repeat(PROJECT_NAME_MAX_LENGTH)).ok).toBe(true);
    expect(listProjects(db)).toHaveLength(1);
  });

  it('CP-04-08: a name that already exists, in any case, is not duplicated', () => {
    expect(createProject(db, 'Web').ok).toBe(true);
    expect(createProject(db, ' web ')).toEqual({ ok: false, error: 'duplicate_project' });
    expect(listProjects(db)).toHaveLength(1);
  });

  it('rejects editing a missing task or using a missing project', () => {
    expect(updateTask(db, 99, { title: 'x' })).toEqual({ ok: false, error: 'not_found' });
    expect(createTask(db, { title: 'x', projectId: 99 })).toEqual({
      ok: false,
      error: 'invalid_project',
    });
  });

  it('CP-02-04: completing and un-completing a task', () => {
    const task = make('t');
    expect(setTaskStatus(db, task.id, 'done')).toMatchObject({
      ok: true,
      task: { status: 'done' },
    });
    expect(setTaskStatus(db, task.id, 'todo')).toMatchObject({
      ok: true,
      task: { status: 'todo' },
    });
    expect(setTaskStatus(db, task.id, 'bogus')).toEqual({ ok: false, error: 'not_found' });
  });

  it('CP-02-05: deleting removes only that task', () => {
    const a = make('a');
    make('b');
    expect(deleteTask(db, a.id)).toBe(true);
    expect(deleteTask(db, a.id)).toBe(false);
    expect(listTasks(db).map((t) => t.title)).toEqual(['b']);
  });

  it('CP-02-06: rejects empty and over-200 titles without creating anything', () => {
    expect(createTask(db, { title: '  ' })).toEqual({ ok: false, error: 'empty' });
    expect(createTask(db, { title: 'a'.repeat(201) })).toEqual({ ok: false, error: 'too_long' });
    const task = make('ok');
    expect(updateTask(db, task.id, { title: '' })).toEqual({ ok: false, error: 'empty' });
    expect(listTasks(db).map((t) => t.title)).toEqual(['ok']);
  });

  it('CP-02-07: deleting a project keeps its tasks as loose', () => {
    const task = make('t', { newProjectName: 'api-gateway' });
    expect(deleteProject(db, task.projectId)).toBe(true);

    expect(listProjects(db)).toEqual([]);
    expect(listTasks(db)).toEqual([
      expect.objectContaining({ title: 't', projectId: null, projectName: null }),
    ]);
  });

  it('CP-07-02: tags are stored normalized and not duplicated in a task', () => {
    const task = make('Migrar DNS', { tags: ['Infra', '#infra', 'infra'] });
    expect(task.tags).toEqual(['infra']);
    expect(listTasks(db)[0].tags).toEqual(['infra']);
    expect(listTags(db)).toEqual(['infra']);
  });

  it('CP-07-03: invalid tags are rejected and the task is not created', () => {
    for (const [tags, error] of [
      [[''], 'tag_empty'],
      [['   '], 'tag_empty'],
      [['a'.repeat(31)], 'tag_too_long'],
    ] as const) {
      expect(createTask(db, { title: 'x', tags })).toEqual({ ok: false, error });
    }
    expect(listTasks(db)).toHaveLength(0);
  });

  it('CP-07-05: removing a tag from one task leaves it on the others', () => {
    const a = make('A', { tags: ['infra', 'api'] });
    make('B', { tags: ['infra'] });
    const updated = updateTask(db, a.id, { title: 'A', tags: ['api'] });
    expect(updated.ok && updated.task.tags).toEqual(['api']);

    const byTitle = Object.fromEntries(listTasks(db).map((t) => [t.title, t.tags]));
    expect(byTitle).toEqual({ A: ['api'], B: ['infra'] });
    expect(listTags(db)).toEqual(['api', 'infra']);
  });

  it('CP-07-06: listTags returns only tags still in use', () => {
    const a = make('A', { tags: ['solo'] });
    make('B', { tags: ['otra'] });
    deleteTask(db, a.id);
    expect(listTags(db)).toEqual(['otra']);
  });

  it('lists pending tasks first, by due date with undated last', () => {
    make('undated');
    make('later', { dueDate: '2026-05-01' });
    make('sooner', { dueDate: '2026-04-01' });
    const done = make('done', { dueDate: '2026-01-01' });
    setTaskStatus(db, done.id, 'done');

    expect(listTasks(db).map((t) => t.title)).toEqual(['sooner', 'later', 'undated', 'done']);
  });

  it('CP-03-08: marking and unmarking "para hoy" persists', () => {
    const task = make('Revisar PR');
    const marked = setTaskForToday(db, task.id, true);
    expect(marked.ok && marked.task.forToday).toBe(true);
    expect(listTasks(db)[0].forToday).toBe(true);

    const unmarked = setTaskForToday(db, task.id, false);
    expect(unmarked.ok && unmarked.task.forToday).toBe(false);
    expect(listTasks(db)[0].forToday).toBe(false);
  });

  it('rejects "para hoy" for unknown tasks and non-boolean values', () => {
    const task = make('x');
    expect(setTaskForToday(db, 999, true)).toEqual({ ok: false, error: 'not_found' });
    expect(setTaskForToday(db, task.id, 'yes')).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('task board status', () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-board-'));
    db = openDatabase(dir);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const make = (title: string) => {
    const result = createTask(db, { title, dueDate: null, projectId: null });
    if (!result.ok) throw new Error(result.error);
    return result.task;
  };

  it('CP-04-02: the in-progress status is stored and survives reopening the database', () => {
    const task = make('Mover');
    const moved = setTaskStatus(db, task.id, 'in_progress');
    expect(moved).toMatchObject({ ok: true, task: { status: 'in_progress', completedAt: null } });

    db.close();
    db = openDatabase(dir);
    expect(listTasks(db)[0].status).toBe('in_progress');
  });

  it('CP-04-03: moving to done completes the task and moving out of done makes it pending again', () => {
    const task = make('Cerrar');
    const now = new Date('2026-03-20T12:00:00.000Z');
    const done = setTaskStatus(db, task.id, 'done', now);
    expect(done).toMatchObject({
      ok: true,
      task: { status: 'done', completedAt: '2026-03-20T12:00:00.000Z' },
    });

    // Done again keeps the original completion time.
    const again = setTaskStatus(db, task.id, 'done', new Date('2026-03-25T00:00:00.000Z'));
    expect(again).toMatchObject({ ok: true, task: { completedAt: '2026-03-20T12:00:00.000Z' } });

    const back = setTaskStatus(db, task.id, 'todo');
    expect(back).toMatchObject({ ok: true, task: { status: 'todo', completedAt: null } });
  });

  it('rejects an unknown status and an unknown task', () => {
    const task = make('X');
    expect(setTaskStatus(db, task.id, 'blocked')).toEqual({ ok: false, error: 'not_found' });
    expect(setTaskStatus(db, 999, 'done')).toEqual({ ok: false, error: 'not_found' });
  });

  it('migration 6 keeps existing tasks, tags and completion when adding in_progress', () => {
    const old = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-mig-'));
    const raw = new Database(path.join(old, 'datos.db'));
    raw.pragma('foreign_keys = ON');
    migrate(
      raw,
      migrations.filter((m) => m.version <= 5),
    );
    raw.exec(`
      INSERT INTO tasks (title, status, created_at) VALUES ('a', 'todo', '2026-01-01T00:00:00.000Z');
      INSERT INTO tasks (title, status, created_at) VALUES ('b', 'done', '2026-01-02T00:00:00.000Z');
      INSERT INTO tags (name) VALUES ('infra');
      INSERT INTO task_tags (task_id, tag_id) VALUES (1, 1), (2, 1);
    `);
    migrate(raw);
    const rows = raw.prepare('SELECT title, status, completed_at FROM tasks ORDER BY id').all();
    expect(rows).toEqual([
      { title: 'a', status: 'todo', completed_at: null },
      { title: 'b', status: 'done', completed_at: '2026-01-02T00:00:00.000Z' },
    ]);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM task_tags').get()).toEqual({ n: 2 });
    expect(() => raw.exec("UPDATE tasks SET status = 'in_progress' WHERE id = 1")).not.toThrow();
    raw.close();
    fs.rmSync(old, { recursive: true, force: true });
  });
});

describe('recurring tasks (RF-06)', () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-series-'));
    db = openDatabase(dir);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const make = (title: string, extra: object = {}) => {
    const result = createTask(db, { title, dueDate: null, projectId: null, ...extra });
    if (!result.ok) throw new Error(result.error);
    return result.task;
  };
  const weekly = { kind: 'weekly', weekday: 5 };
  const noon = (date: string) => new Date(`${date}T12:00:00`);
  const open = () => listTasks(db).filter((t) => t.status !== 'done');

  it('CP-06-02: completing a "once" task creates nothing', () => {
    const task = make('Una vez', { recurrence: { kind: 'once' } });
    expect(task.seriesId).toBeNull();
    setTaskStatus(db, task.id, 'done');
    expect(listTasks(db)).toHaveLength(1);
  });

  it('CP-06-03: completing a daily instance creates the next one with title, project and tags', () => {
    const task = make('Revisar backups', {
      dueDate: '2026-03-10',
      newProjectName: 'infra',
      tags: ['ops'],
      recurrence: { kind: 'daily' },
    });
    expect(task.recurrence).toEqual({ kind: 'daily' });
    const result = setTaskStatus(db, task.id, 'done', noon('2026-03-10'));
    expect(result).toMatchObject({ ok: true, task: { status: 'done' } });

    const next = open();
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      title: 'Revisar backups',
      dueDate: '2026-03-11',
      projectId: task.projectId,
      tags: ['ops'],
      status: 'todo',
      seriesId: task.seriesId,
    });
  });

  it('CP-06-03: the next instance and the completion are one transaction', () => {
    const task = make('Atómica', { dueDate: '2026-03-10', recurrence: { kind: 'daily' } });
    db.exec(`CREATE TRIGGER boom BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'boom'); END`);
    expect(() => setTaskStatus(db, task.id, 'done', noon('2026-03-10'))).toThrow();
    db.exec('DROP TRIGGER boom');
    expect(listTasks(db)[0]).toMatchObject({ status: 'todo', completedAt: null });
  });

  it('CP-06-04: weekly completes into the next chosen weekday', () => {
    const task = make('Semanal', { dueDate: '2026-03-06', recurrence: weekly });
    setTaskStatus(db, task.id, 'done', noon('2026-03-06'));
    expect(open()[0].dueDate).toBe('2026-03-13');
  });

  it('CP-06-05 and CP-06-06: monthly day 31 clamps in February and returns to 31', () => {
    const task = make('Mensual', {
      dueDate: '2026-01-31',
      recurrence: { kind: 'monthly', monthDay: 31 },
    });
    setTaskStatus(db, task.id, 'done', noon('2026-01-31'));
    const feb = open()[0];
    expect(feb.dueDate).toBe('2026-02-28');
    setTaskStatus(db, feb.id, 'done', noon('2026-02-28'));
    expect(open()[0].dueDate).toBe('2026-03-31');
  });

  it('CP-06-07: an overdue instance yields one instance on the first future date', () => {
    const task = make('Atrasada', { dueDate: '2026-02-20', recurrence: weekly });
    setTaskStatus(db, task.id, 'done', noon('2026-03-10'));
    expect(open()).toHaveLength(1);
    expect(open()[0].dueDate).toBe('2026-03-13');
    expect(open()[0].dueDate! >= '2026-03-10').toBe(true);
  });

  it('CP-06-08: reopening an instance that already generated its successor keeps one open', () => {
    const task = make('Reabrir', { dueDate: '2026-03-06', recurrence: weekly });
    setTaskStatus(db, task.id, 'done', noon('2026-03-06'));
    setTaskStatus(db, task.id, 'todo');
    expect(open()).toHaveLength(1);
    expect(open()[0].id).toBe(task.id);
    expect(listTasks(db)).toHaveLength(1);

    // Completing again regenerates a single successor, not a duplicate.
    setTaskStatus(db, task.id, 'done', noon('2026-03-06'));
    setTaskStatus(db, task.id, 'done', noon('2026-03-06'));
    expect(listTasks(db)).toHaveLength(2);
  });

  it('CP-06-08: a successor already in progress wins and the reopened task leaves the series', () => {
    const task = make('En curso', { dueDate: '2026-03-06', recurrence: weekly });
    setTaskStatus(db, task.id, 'done', noon('2026-03-06'));
    const next = open()[0];
    setTaskStatus(db, next.id, 'in_progress');
    setTaskStatus(db, task.id, 'todo');
    expect(open().filter((t) => t.seriesId !== null)).toHaveLength(1);
    expect(open().find((t) => t.id === next.id)?.seriesId).not.toBeNull();
  });

  it('CP-06-10: editing the rule changes the open instance and the following ones only', () => {
    const first = make('Cambia', { dueDate: '2026-03-06', recurrence: weekly });
    setTaskStatus(db, first.id, 'done', noon('2026-03-06'));
    const second = open()[0];
    const result = updateTask(db, second.id, {
      title: 'Cambia',
      dueDate: '2026-03-13',
      projectId: null,
      recurrence: { kind: 'daily' },
    });
    expect(result).toMatchObject({ ok: true, task: { recurrence: { kind: 'daily' } } });
    setTaskStatus(db, second.id, 'done', noon('2026-03-13'));
    expect(open()[0].dueDate).toBe('2026-03-14');
    const completed = listTasks(db).find((t) => t.id === first.id)!;
    expect(completed).toMatchObject({ status: 'done', dueDate: '2026-03-06' });
  });

  it('CP-06-10: a plain task can become a series and a series can become "once"', () => {
    const task = make('Plana', { dueDate: '2026-03-06' });
    const base = { title: 'Plana', dueDate: '2026-03-06', projectId: null };
    const made = updateTask(db, task.id, { ...base, recurrence: weekly });
    expect(made).toMatchObject({ ok: true, task: { recurrence: weekly } });
    const plain = updateTask(db, task.id, { ...base, recurrence: { kind: 'once' } });
    expect(plain).toMatchObject({ ok: true, task: { seriesId: null } });
    expect(db.prepare('SELECT COUNT(*) AS n FROM task_series').get()).toEqual({ n: 0 });
  });

  it('CP-06-11: deleting a series removes it and its open instance, keeping the history', () => {
    const first = make('Serie', { dueDate: '2026-03-06', recurrence: weekly });
    setTaskStatus(db, first.id, 'done', noon('2026-03-06'));
    const second = open()[0];
    expect(deleteSeries(db, second.seriesId)).toBe(true);
    const left = listTasks(db);
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ id: first.id, status: 'done', seriesId: null });
    expect(db.prepare('SELECT COUNT(*) AS n FROM task_series').get()).toEqual({ n: 0 });
    expect(deleteSeries(db, 999)).toBe(false);
    expect(deleteSeries(db, 'x')).toBe(false);
  });

  it('deleting the open instance directly also ends the series', () => {
    const task = make('Suelta serie', { dueDate: '2026-03-06', recurrence: weekly });
    expect(deleteTask(db, task.id)).toBe(true);
    expect(db.prepare('SELECT COUNT(*) AS n FROM task_series').get()).toEqual({ n: 0 });
  });

  it('CP-06-12: main rejects invalid rules with a specific error', () => {
    const base = { title: 'X', dueDate: '2026-03-06', projectId: null };
    expect(createTask(db, { ...base, recurrence: { kind: 'weekly' } })).toEqual({
      ok: false,
      error: 'recurrence_weekday',
    });
    expect(createTask(db, { ...base, recurrence: { kind: 'monthly', monthDay: 32 } })).toEqual({
      ok: false,
      error: 'recurrence_month_day',
    });
    expect(createTask(db, { ...base, dueDate: null, recurrence: weekly })).toEqual({
      ok: false,
      error: 'recurrence_due_required',
    });
    expect(createTask(db, { ...base, recurrence: 'daily' })).toEqual({
      ok: false,
      error: 'invalid_recurrence',
    });
    expect(listTasks(db)).toHaveLength(0);
  });

  it('CP-06-14: migration 7 keeps existing tasks intact and without series', () => {
    const old = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-mig-'));
    const raw = new Database(path.join(old, 'datos.db'));
    raw.pragma('foreign_keys = ON');
    migrate(
      raw,
      migrations.filter((m) => m.version <= 6),
    );
    raw.exec(`
      INSERT INTO tasks (title, status, due_date, created_at) VALUES ('a', 'todo', '2026-03-01', '2026-01-01T00:00:00.000Z');
      INSERT INTO tasks (title, status, created_at, completed_at) VALUES ('b', 'done', '2026-01-02T00:00:00.000Z', '2026-01-03T00:00:00.000Z');
    `);
    migrate(raw);
    expect(
      raw.prepare('SELECT title, status, due_date, series_id FROM tasks ORDER BY id').all(),
    ).toEqual([
      { title: 'a', status: 'todo', due_date: '2026-03-01', series_id: null },
      { title: 'b', status: 'done', due_date: null, series_id: null },
    ]);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM task_series').get()).toEqual({ n: 0 });
    raw.close();
    fs.rmSync(old, { recursive: true, force: true });
  });

  it('uses the local date for the overdue rule', () => {
    expect(localDate(noon('2026-03-10'))).toBe('2026-03-10');
  });

  it('CP-18-01: a reminder assigned to a task is stored and returned when reading it', () => {
    const task = make('Sin aviso');
    expect(task.reminderAt).toBeNull();

    const updated = updateTask(db, task.id, {
      title: 'Sin aviso',
      reminderAt: '2026-03-10T09:00',
    });

    expect(updated).toMatchObject({ ok: true, task: { reminderAt: '2026-03-10T09:00' } });
    expect(listTasks(db)[0]).toMatchObject({
      reminderAt: '2026-03-10T09:00',
      reminderNotifiedAt: null,
    });
  });

  it('CP-18-02: an invalid reminder is rejected on create and update and nothing is written', () => {
    const task = make('Intacta', { reminderAt: '2026-03-10T09:00' });
    const invalid = [
      '2026-13-10T09:00',
      '2026-02-30T09:00',
      '2026-03-10T25:00',
      '2026-03-10T09:61',
      '2026-03-10 09:00',
      '09:00',
      'mañana',
      42,
      {},
    ];

    for (const reminderAt of invalid) {
      expect(createTask(db, { title: 'Nueva', reminderAt })).toEqual({
        ok: false,
        error: 'invalid_reminder',
      });
      expect(updateTask(db, task.id, { title: 'Cambiada', reminderAt })).toEqual({
        ok: false,
        error: 'invalid_reminder',
      });
    }
    expect(listTasks(db)).toHaveLength(1);
    expect(listTasks(db)[0]).toMatchObject({ title: 'Intacta', reminderAt: '2026-03-10T09:00' });
  });

  it('rejects a reminder on a recurring task', () => {
    expect(
      createTask(db, {
        title: 'Serie',
        dueDate: '2026-03-10',
        recurrence: { kind: 'daily' },
        reminderAt: '2026-03-10T09:00',
      }),
    ).toEqual({ ok: false, error: 'reminder_series' });
  });

  it('re-arms the reminder only when its time changes', () => {
    const task = make('Aviso', { reminderAt: '2026-03-10T09:00' });
    db.prepare('UPDATE tasks SET reminder_notified_at = ? WHERE id = ?').run(
      '2026-03-10T12:00:00.000Z',
      task.id,
    );

    const renamed = updateTask(db, task.id, {
      title: 'Renombrada',
      reminderAt: '2026-03-10T09:00',
    });
    expect(renamed).toMatchObject({
      ok: true,
      task: { reminderNotifiedAt: '2026-03-10T12:00:00.000Z' },
    });

    const moved = updateTask(db, task.id, { title: 'Renombrada', reminderAt: '2026-03-11T09:00' });
    expect(moved).toMatchObject({ ok: true, task: { reminderNotifiedAt: null } });
  });
});
