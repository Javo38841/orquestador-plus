import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../shared/ipc';
import { HIDE_FROM_TODAY_MAX } from '../../shared/tasks';
import { openDatabase } from '../db/database';
import { registerIpcHandlers } from '../ipc/register';
import { createTask, getTask, hideFromToday, listTasks, setTaskStatus } from './tasks';

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
vi.mock('../channel', () => ({ CHANNEL: 'dev' }));
vi.mock('electron', () => ({
  app: { getName: () => 'x', getVersion: () => '0' },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn),
  },
}));

describe('hide completed tasks from Hoy (#93)', () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-hide-today-'));
    db = openDatabase(dir);
    handlers.clear();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const make = (title: string, done = false) => {
    const result = createTask(db, { title, dueDate: null, projectId: null });
    if (!result.ok) throw new Error(result.error);
    if (done) setTaskStatus(db, result.task.id, 'done', new Date('2026-10-23T09:00:00.000Z'));
    return result.task.id;
  };
  const hiddenAt = (id: number) => getTask(db, id)!.hiddenFromTodayAt;

  it('CP-03-27: hiding only stamps the task; it stays done in the list and in the database', () => {
    const id = make('Pagar la luz', true);
    expect(hiddenAt(id)).toBeNull();

    expect(hideFromToday(db, [id], new Date('2026-10-23T10:00:00.000Z'))).toBe(1);

    expect(hiddenAt(id)).toBe('2026-10-23T10:00:00.000Z');
    const task = listTasks(db).find((t) => t.id === id)!;
    expect(task).toMatchObject({ title: 'Pagar la luz', status: 'done' });
  });

  it('CP-03-28: hides several completed tasks at once and leaves pending ones alone', () => {
    const a = make('A', true);
    const b = make('B', true);
    const pending = make('C');

    expect(hideFromToday(db, [a, b, pending, a])).toBe(2);
    expect(hiddenAt(a)).not.toBeNull();
    expect(hiddenAt(b)).not.toBeNull();
    expect(hiddenAt(pending)).toBeNull();
  });

  it('CP-03-29: invalid payloads are rejected without changing anything', () => {
    const id = make('A', true);
    const tooMany = Array.from({ length: HIDE_FROM_TODAY_MAX + 1 }, () => id);
    for (const payload of [undefined, null, id, 'x', {}, [], ['1'], [1.5], [id, null], tooMany]) {
      expect(hideFromToday(db, payload), JSON.stringify(payload)?.slice(0, 30)).toBe(0);
    }
    expect(hiddenAt(id)).toBeNull();
    expect(hideFromToday(db, [9999])).toBe(0);
  });

  it('CP-03-29: every task changes in one transaction: a failure leaves none hidden', () => {
    const a = make('A', true);
    const b = make('B', true);
    db.exec(`CREATE TRIGGER fail_on_b BEFORE UPDATE OF hidden_from_today_at ON tasks
             WHEN new.id = ${b} BEGIN SELECT RAISE(ABORT, 'disk full'); END;`);

    expect(() => hideFromToday(db, [a, b])).toThrow('disk full');
    expect(hiddenAt(a)).toBeNull();
  });

  it('CP-03-29: the IPC channel validates the payload in main', () => {
    registerIpcHandlers(db, path.join(dir, 'wiki'));
    const hide = handlers.get(IpcChannel.hideFromToday)!;
    const id = make('A', true);

    expect(hide({}, 'DROP TABLE tasks')).toBe(0);
    expect(hide({}, [id])).toBe(1);
    expect(hiddenAt(id)).not.toBeNull();
  });

  it('CP-03-30: reopening and completing again stamps a completion newer than the hiding', () => {
    const id = make('A', true);
    hideFromToday(db, [id], new Date('2026-10-23T10:00:00.000Z'));
    setTaskStatus(db, id, 'todo');
    setTaskStatus(db, id, 'done', new Date('2026-10-23T11:00:00.000Z'));

    const task = getTask(db, id)!;
    expect(task.completedAt! > task.hiddenFromTodayAt!).toBe(true);
  });
});
