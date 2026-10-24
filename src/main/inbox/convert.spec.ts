import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listBugs } from '../bugs/bugs';
import { openDatabase } from '../db/database';
import { listTasks } from '../tasks/tasks';
import { createNote, listNotes, listSections, createSection, type Wiki } from '../wiki/wiki';
import { captureItem, convertItem, listInbox } from './inbox';

const bugForm = {
  title: 'Falla el login',
  symptom: 'Pantalla blanca',
  impact: 'Nadie entra',
  rootCause: '',
  solution: '',
  severity: 'high',
};

describe('inbox conversion to bug and note', () => {
  let root: string;
  let db: Database.Database;
  let wiki: Wiki;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-convert-'));
    db = openDatabase(root);
    wiki = { db, dir: path.join(root, 'wiki') };
    captureItem(db, 'Texto capturado');
  });

  afterEach(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('CP-01-15: a bug conversion creates the bug and removes the item', () => {
    const result = convertItem(wiki, 1, { type: 'bug', input: bugForm });
    expect(result.ok).toBe(true);
    if (!result.ok || result.type !== 'bug') throw new Error('expected a bug');
    expect(result.bug).toMatchObject({ title: 'Falla el login', severity: 'high' });
    expect(listBugs(db)).toHaveLength(1);
    expect(listInbox(db)).toEqual([]);
  });

  it('CP-01-16: an invalid or empty bug form creates nothing and keeps the item', () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ ...bugForm, title: '  ' }, 'empty'],
      [{ ...bugForm, symptom: ' ' }, 'empty'],
      [{ ...bugForm, impact: '' }, 'empty'],
      [{ ...bugForm, severity: 'critical' }, 'invalid'],
      [{ ...bugForm, severity: undefined }, 'invalid'],
      [{ ...bugForm, title: 'x'.repeat(201) }, 'too_long'],
    ];
    for (const [input, error] of cases) {
      expect(convertItem(wiki, 1, { type: 'bug', input })).toEqual({ ok: false, error });
    }
    expect(listBugs(db)).toEqual([]);
    expect(listInbox(db)).toHaveLength(1);
  });

  it('CP-01-19: a note conversion writes the .md in the section with the captured text', () => {
    createSection(wiki, { name: 'Guias' });
    const result = convertItem(wiki, 1, {
      type: 'note',
      input: { title: 'Mi nota', section: 'Guias' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.type !== 'note') throw new Error('expected a note');
    expect(result.note.slug).toBe('Guias/Mi nota');
    const file = path.join(wiki.dir, 'Guias', 'Mi nota.md');
    expect(fs.readFileSync(file, 'utf8')).toContain('Texto capturado');
    expect(listInbox(db)).toEqual([]);
  });

  it('CP-01-19: a note without section goes to the root of the wiki', () => {
    const result = convertItem(wiki, 1, { type: 'note', input: { title: 'Raiz' } });
    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(wiki.dir, 'Raiz.md'))).toBe(true);
  });

  it('CP-01-20: a duplicate title in the section creates no file and keeps the item', () => {
    createNote(wiki, { title: 'Repetida', content: 'ya existe' });
    const before = fs.readdirSync(wiki.dir);
    expect(convertItem(wiki, 1, { type: 'note', input: { title: 'repetida' } })).toEqual({
      ok: false,
      error: 'duplicate',
    });
    expect(fs.readdirSync(wiki.dir)).toEqual(before);
    expect(listNotes(wiki)).toHaveLength(1);
    expect(listInbox(db)).toHaveLength(1);
  });

  it('CP-01-21: an empty or too long note title creates nothing', () => {
    expect(convertItem(wiki, 1, { type: 'note', input: { title: '   ' } })).toEqual({
      ok: false,
      error: 'empty',
    });
    expect(convertItem(wiki, 1, { type: 'note', input: { title: 'x'.repeat(201) } })).toEqual({
      ok: false,
      error: 'too_long',
    });
    expect(listNotes(wiki)).toEqual([]);
    expect(listInbox(db)).toHaveLength(1);
  });

  it('CP-01-24: a failing bug insert leaves the item and no bug', () => {
    db.exec("CREATE TRIGGER fail_bug BEFORE INSERT ON bugs BEGIN SELECT RAISE(ABORT, 'boom'); END");
    expect(() => convertItem(wiki, 1, { type: 'bug', input: bugForm })).toThrow('boom');
    expect(listBugs(db)).toEqual([]);
    expect(listInbox(db)).toHaveLength(1);
  });

  it('CP-01-24: a file write failure leaves the item and no half-made note', () => {
    fs.mkdirSync(wiki.dir, { recursive: true });
    // A file where the section folder should be makes the write fail.
    fs.writeFileSync(path.join(wiki.dir, 'Bloqueada'), 'no soy carpeta');
    const result = convertItem(wiki, 1, {
      type: 'note',
      input: { title: 'Nota', section: 'Bloqueada' },
    });
    expect(result.ok).toBe(false);
    expect(listNotes(wiki)).toEqual([]);
    expect(listSections(wiki)).toEqual([]);
    expect(listInbox(db)).toHaveLength(1);
  });

  it('CP-01-24: a failing inbox delete leaves no file behind', () => {
    db.exec(
      "CREATE TRIGGER fail_delete BEFORE DELETE ON inbox_items BEGIN SELECT RAISE(ABORT, 'boom'); END",
    );
    expect(() => convertItem(wiki, 1, { type: 'note', input: { title: 'Nota' } })).toThrow('boom');
    expect(fs.existsSync(path.join(wiki.dir, 'Nota.md'))).toBe(false);
    expect(listInbox(db)).toHaveLength(1);
  });

  it('CP-01-25: rejects bad payloads for every type without modifying data', () => {
    const bad: [unknown, unknown, string][] = [
      [1, undefined, 'invalid'],
      [1, null, 'invalid'],
      [1, 'task', 'invalid'],
      [1, { type: 'epic', input: {} }, 'invalid'],
      [1, { type: 'bug' }, 'invalid'],
      [1, { type: 'note', input: 'texto' }, 'invalid'],
      [1, { type: 'task', input: null }, 'invalid'],
      [1, { type: 'bug', input: { ...bugForm, title: 5 } }, 'invalid'],
      [1, { type: 'bug', input: { ...bugForm, symptom: 5 } }, 'invalid'],
      [1, { type: 'note', input: { title: 5 } }, 'invalid'],
      [1, { type: 'note', input: { title: 'a', content: 5 } }, 'invalid'],
      [1, { type: 'note', input: { title: 'a', section: '../fuera' } }, 'invalid'],
      [1, { type: 'note', input: { title: 'a', section: '/etc' } }, 'invalid'],
      [1, { type: 'note', input: { title: 'a', section: 5 } }, 'invalid'],
      [99, { type: 'bug', input: bugForm }, 'not_found'],
      [99, { type: 'note', input: { title: 'a' } }, 'not_found'],
      [99, { type: 'task', input: { title: 'a' } }, 'not_found'],
      ['1', { type: 'bug', input: bugForm }, 'not_found'],
      [1.5, { type: 'note', input: { title: 'a' } }, 'not_found'],
    ];
    for (const [id, conversion, error] of bad) {
      const result = convertItem(wiki, id, conversion);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe(error);
    }
    expect(listInbox(db)).toHaveLength(1);
    expect(listBugs(db)).toEqual([]);
    expect(listTasks(db)).toEqual([]);
    expect(listNotes(wiki)).toEqual([]);
    expect(fs.existsSync(wiki.dir) ? fs.readdirSync(wiki.dir) : []).toEqual([]);
  });

  it('CP-01-25: a task conversion still works through the same payload', () => {
    const result = convertItem(wiki, 1, { type: 'task', input: { title: 'Hacer algo' } });
    expect(result.ok && result.type).toBe('task');
    expect(listTasks(db)).toHaveLength(1);
    expect(listInbox(db)).toEqual([]);
  });
});
