import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureItem, convertToTask, discardItem } from '../inbox/inbox';
import { openDatabase } from '../db/database';
import { migrate, migrations } from '../db/migrations';
import { createTask, deleteTask, updateTask } from '../tasks/tasks';
import { IpcChannel } from '../../shared/ipc';
import { registerIpcHandlers } from '../ipc/register';
import { search } from './search';

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
vi.mock('../channel', () => ({ CHANNEL: 'dev' }));
vi.mock('electron', () => ({
  app: { getName: () => 'x', getVersion: () => '0' },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn),
  },
}));

describe('global search', () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-search-'));
    db = openDatabase(dir);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const task = (title: string) => {
    const r = createTask(db, { title });
    if (!r.ok) throw new Error('task');
    return r.task;
  };

  it('CP-10-01: finds tasks and inbox items with their kind, id and title', () => {
    const t = task('Preparar informe mensual');
    captureItem(db, 'Revisar informe de ventas');
    captureItem(db, 'Comprar café');

    const results = search(db, 'informe');

    expect(results).toHaveLength(2);
    expect(results).toContainEqual({ kind: 'task', id: t.id, title: 'Preparar informe mensual' });
    expect(results).toContainEqual({ kind: 'inbox', id: 1, title: 'Revisar informe de ventas' });
  });

  it('CP-10-02: reflects create, edit and delete of tasks and inbox items at once', () => {
    const t = task('Llamar al banco');
    expect(search(db, 'banco')).toHaveLength(1);

    updateTask(db, t.id, { title: 'Llamar al dentista' });
    expect(search(db, 'banco')).toEqual([]);
    expect(search(db, 'dentista')).toHaveLength(1);

    deleteTask(db, t.id);
    expect(search(db, 'dentista')).toEqual([]);

    captureItem(db, 'Idea sobre cohetes');
    expect(search(db, 'cohetes')).toHaveLength(1);
    discardItem(db, 1);
    expect(search(db, 'cohetes')).toEqual([]);
  });

  it('CP-10-02: converting an inbox item moves it from the inbox to the tasks', () => {
    captureItem(db, 'Pagar impuestos');
    convertToTask(db, 1, { title: 'Pagar impuestos' });

    expect(search(db, 'impuestos').map((r) => r.kind)).toEqual(['task']);
  });

  it.each([
    '',
    '   ',
    '"',
    '*',
    '-',
    'AND',
    'OR NOT',
    '(',
    ')',
    '"unbalanced',
    'a AND (b',
    'NEAR(',
  ])('CP-10-03: %j does not throw', (text) => {
    task('Tarea AND con "comillas" y (paréntesis) - guion*');
    expect(() => search(db, text)).not.toThrow();
  });

  it('CP-10-03: blank and operator-only terms return nothing, words stay literal', () => {
    task('Tarea con AND dentro');
    expect(search(db, '   ')).toEqual([]);
    expect(search(db, '"*-()')).toEqual([]);
    expect(search(db, 'AND')).toHaveLength(1);
    expect(search(db, '"tarea" -dentro*')).toHaveLength(1);
  });

  it('CP-10-04: ignores case and accents in both directions', () => {
    task('Información del cliente');
    expect(search(db, 'informacion')).toHaveLength(1);
    expect(search(db, 'INFORMACIÓN')).toHaveLength(1);
  });

  it('CP-10-05: a partial prefix matches', () => {
    task('Reunión de equipo');
    expect(search(db, 'reun')).toHaveLength(1);
    expect(search(db, 'reunion eq')).toHaveLength(1);
    expect(search(db, 'union')).toEqual([]);
  });

  it('CP-10-06: populates the index from existing data and leaves earlier migrations intact', () => {
    const old = new Database(':memory:');
    const before = migrations.filter((m) => m.version < 12);
    migrate(old, before);
    old.prepare("INSERT INTO tasks (title, created_at) VALUES ('Tarea previa', 'x')").run();
    old
      .prepare(
        "INSERT INTO inbox_items (title, source, created_at) VALUES ('Captura previa', 'quick_capture', 'x')",
      )
      .run();

    migrate(old);

    expect(
      search(old, 'previa')
        .map((r) => r.kind)
        .sort(),
    ).toEqual(['inbox', 'task']);
    expect(migrations.map((m) => m.version)).toEqual(migrations.map((_, i) => i + 1));
    expect(migrations.find((m) => m.version === 11)!.name).toBe('task_reminders');
  });

  it('CP-10-07: returns at most 50 results', () => {
    const insert = db.prepare("INSERT INTO tasks (title, created_at) VALUES (?, 'x')");
    db.transaction(() => {
      for (let i = 0; i < 80; i++) insert.run(`Informe número ${i}`);
    })();

    expect(search(db, 'informe')).toHaveLength(50);
  });

  it('CP-10-07: orders by relevance', () => {
    task('informe informe informe');
    task('un informe entre muchas otras palabras sueltas');
    expect(search(db, 'informe')[0].title).toBe('informe informe informe');
  });

  describe('IPC channel', () => {
    it('CP-10-08: rejects a non-string or over-long payload and answers a valid one', async () => {
      registerIpcHandlers(db, dir);
      const handle = handlers.get(IpcChannel.search)!;
      task('Reunión semanal');

      expect(() => handle({}, 42)).toThrow();
      expect(() => handle({}, { q: 'x' })).toThrow();
      expect(() => handle({}, 'a'.repeat(201))).toThrow();
      expect(handle({}, 'a'.repeat(200))).toEqual([]);
      expect(handle({}, 'reunion')).toEqual([{ kind: 'task', id: 1, title: 'Reunión semanal' }]);
    });
  });
});
