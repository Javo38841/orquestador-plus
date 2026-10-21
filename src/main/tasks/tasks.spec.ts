import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import {
  createProject,
  createTask,
  deleteProject,
  deleteTask,
  listProjects,
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
