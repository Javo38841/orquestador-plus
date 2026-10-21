import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../db/database';
import { captureItem } from '../inbox/inbox';
import { createProject, createTask } from '../tasks/tasks';
import { parseCsv } from './csv';
import { buildExport, EXPORT_TABLES, exportAll, defaultExportName } from './export';
import { readZip } from './zip';

describe('export', () => {
  let dir: string;
  let wikiDir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-export-'));
    wikiDir = path.join(dir, 'wiki');
    db = openDatabase(dir);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const files = () => new Map(readZip(buildExport(db, wikiDir)).map((e) => [e.name, e.data]));
  const json = (zip: Map<string, Buffer>, name: string) =>
    JSON.parse(zip.get(name)!.toString('utf8')) as Record<string, unknown>[];

  it('CP-11-02: the ZIP has a JSON and a CSV per entity with all rows and columns', () => {
    const project = createProject(db, 'cabina');
    if (!project.ok) throw new Error(project.error);
    createTask(db, {
      title: 'Escribir informe',
      dueDate: null,
      projectId: project.project.id,
      tags: ['urgente'],
    });
    createTask(db, { title: 'Segunda', dueDate: null, projectId: null });
    captureItem(db, 'Idea suelta');

    const zip = files();
    for (const { name } of EXPORT_TABLES) {
      expect(zip.has(`${name}.json`)).toBe(true);
      expect(zip.has(`${name}.csv`)).toBe(true);
    }
    const tasks = json(zip, 'tasks.json');
    expect(tasks).toHaveLength(2);
    expect(Object.keys(tasks[0]!)).toEqual(
      db
        .prepare('SELECT * FROM tasks')
        .columns()
        .map((c) => c.name),
    );
    expect(tasks[0]).toMatchObject({ title: 'Escribir informe', project_id: project.project.id });
    expect(json(zip, 'projects.json')).toMatchObject([{ name: 'cabina' }]);
    expect(json(zip, 'tags.json')).toMatchObject([{ name: 'urgente' }]);
    expect(json(zip, 'task_tags.json')).toHaveLength(1);
    expect(json(zip, 'inbox_items.json')).toMatchObject([{ title: 'Idea suelta' }]);

    const csv = parseCsv(zip.get('tasks.csv')!.toString('utf8'));
    expect(csv).toHaveLength(3);
    expect(csv[0]).toEqual(Object.keys(tasks[0]!));
    expect(csv[1]![csv[0]!.indexOf('title')]).toBe('Escribir informe');
  });

  it('CP-11-03: the wiki folder is included with the .md files unmodified', () => {
    fs.mkdirSync(wikiDir);
    const body =
      '---\ntitle: "Nota ñ"\ncreated: 2026-01-01T00:00:00.000Z\n---\n\nHola [[otra]]\r\n';
    fs.writeFileSync(path.join(wikiDir, 'nota.md'), body);
    fs.writeFileSync(path.join(wikiDir, 'ignorado.txt'), 'no');

    const zip = files();
    expect(zip.get('wiki/nota.md')!.toString('utf8')).toBe(body);
    expect(zip.has('wiki/ignorado.txt')).toBe(false);
  });

  it('CP-11-04: values with commas, quotes, line breaks and accents survive the CSV', () => {
    const title = 'a, "b"\nñandú ✓';
    createTask(db, { title, dueDate: null, projectId: null });
    const csv = parseCsv(files().get('tasks.csv')!.toString('utf8'));
    expect(csv[1]![csv[0]!.indexOf('title')]).toBe(title);
  });

  it('CP-11-05: an empty database exports every entity with only headers / empty arrays', () => {
    const zip = files();
    for (const { name } of EXPORT_TABLES) {
      expect(json(zip, `${name}.json`)).toEqual([]);
      const csv = parseCsv(zip.get(`${name}.csv`)!.toString('utf8'));
      expect(csv).toHaveLength(1);
      expect(csv[0]!.length).toBeGreaterThan(0);
    }
    expect([...zip.keys()].some((n) => n.startsWith('wiki/'))).toBe(false);
  });

  it('CP-11-06: all tables are read inside one transaction', () => {
    const inTransaction: boolean[] = [];
    const prepare = db.prepare.bind(db);
    vi.spyOn(db, 'prepare').mockImplementation(((sql: string) => {
      inTransaction.push(db.inTransaction);
      return prepare(sql);
    }) as typeof db.prepare);
    buildExport(db, wikiDir);
    expect(inTransaction).toHaveLength(EXPORT_TABLES.length);
    expect(inTransaction.every(Boolean)).toBe(true);
  });

  describe('exportAll', () => {
    const at = () => new Date(2026, 2, 5, 10);

    it('CP-11-07: main rejects any payload, and the result carries no archive or handle', async () => {
      const chooseFile = vi.fn(async () => path.join(dir, 'x.zip'));
      for (const bad of ['C:\\x.zip', {}, 1, null, ['/etc/passwd']]) {
        await expect(exportAll({ db, wikiDir, chooseFile }, bad)).rejects.toThrow('Invalid');
      }
      expect(chooseFile).not.toHaveBeenCalled();
      const result = await exportAll({ db, wikiDir, chooseFile });
      expect(Object.keys(result).sort()).toEqual(['ok', 'path']);
    });

    it('proposes orquestadorplus-AAAA-MM-DD.zip and writes the archive', async () => {
      expect(defaultExportName(at())).toBe('orquestadorplus-2026-03-05.zip');
      const target = path.join(dir, 'out.zip');
      const chooseFile = vi.fn(async () => target);
      createTask(db, { title: 'Una', dueDate: null, projectId: null });
      const result = await exportAll({ db, wikiDir, chooseFile, now: at });
      expect(chooseFile).toHaveBeenCalledWith('orquestadorplus-2026-03-05.zip');
      expect(result).toEqual({ ok: true, path: target });
      expect(readZip(fs.readFileSync(target)).map((e) => e.name)).toContain('tasks.json');
      expect(fs.readdirSync(dir)).not.toContain('out.zip.part');
    });

    it('CP-11-08: cancelling the dialog writes nothing', async () => {
      const result = await exportAll({ db, wikiDir, chooseFile: async () => null });
      expect(result).toEqual({ ok: false, error: 'cancelled' });
      expect(fs.readdirSync(dir).filter((f) => f.endsWith('.zip') || f.endsWith('.part'))).toEqual(
        [],
      );
    });

    it('CP-11-08: a failed write leaves no partial file and reports the failure', async () => {
      const target = path.join(dir, 'missing-folder', 'out.zip');
      const result = await exportAll({ db, wikiDir, chooseFile: async () => target });
      expect(result).toEqual({ ok: false, error: 'write_failed' });
      expect(fs.existsSync(target)).toBe(false);
      expect(fs.existsSync(`${target}.part`)).toBe(false);
    });

    it('CP-11-08: a failure while renaming removes the temporary file', async () => {
      const target = path.join(dir, 'taken');
      fs.mkdirSync(path.join(target, 'inner'), { recursive: true });
      const result = await exportAll({ db, wikiDir, chooseFile: async () => target });
      expect(result).toEqual({ ok: false, error: 'write_failed' });
      expect(fs.existsSync(`${target}.part`)).toBe(false);
    });
  });
});
