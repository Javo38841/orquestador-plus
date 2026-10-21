import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import { migrations } from '../db/migrations';
import { createBug, deleteBug, listBugs, setBugStatus, updateBug } from './bugs';

describe('bugs', () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-bugs-'));
    db = openDatabase(dir);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const make = (title: string, extra: object = {}) => {
    const result = createBug(db, { title, severity: 'medium', ...extra });
    if (!result.ok) throw new Error(result.error);
    return result.bug;
  };

  it('CP-09-01: a new bug starts as "new" with the BUG-1 code and keeps its symptom', () => {
    const bug = make('Falla el login', { symptom: 'Devuelve 500' });
    expect(bug.code).toBe('BUG-1');
    expect(bug.status).toBe('new');
    expect(bug.symptom).toBe('Devuelve 500');
    expect(listBugs(db)).toHaveLength(1);
  });

  it('CP-09-02: identifiers are consecutive', () => {
    expect([make('a'), make('b'), make('c')].map((b) => b.code)).toEqual([
      'BUG-1',
      'BUG-2',
      'BUG-3',
    ]);
  });

  it('CP-09-03: deleting the last bug does not free its identifier', () => {
    make('a');
    const last = make('b');
    expect(deleteBug(db, last.id)).toBe(true);
    expect(make('c').code).toBe('BUG-3');
  });

  it('CP-09-04: an empty or whitespace-only title is rejected and nothing is created', () => {
    expect(createBug(db, { title: '', severity: 'medium' })).toEqual({ ok: false, error: 'empty' });
    expect(createBug(db, { title: '   \n ' })).toEqual({ ok: false, error: 'empty' });
    expect(createBug(db, null)).toEqual({ ok: false, error: 'invalid' });
    expect(listBugs(db)).toEqual([]);
  });

  it('CP-09-04: a title over 200 characters is rejected', () => {
    expect(createBug(db, { title: 'a'.repeat(201) })).toEqual({ ok: false, error: 'too_long' });
  });

  it('CP-09-04: updating with an empty title is rejected and keeps the bug', () => {
    const bug = make('Original');
    expect(updateBug(db, bug.id, { title: ' ' })).toEqual({ ok: false, error: 'empty' });
    expect(listBugs(db)[0].title).toBe('Original');
  });

  it('CP-09-05: symptom, impact, root cause and solution are saved on edit', () => {
    const bug = make('Falla');
    const result = updateBug(db, bug.id, {
      title: ' Falla editada ',
      symptom: 's',
      impact: 'i',
      rootCause: 'r',
      solution: 'x',
      severity: 'medium',
    });
    expect(result.ok && result.bug).toMatchObject({
      title: 'Falla editada',
      symptom: 's',
      impact: 'i',
      rootCause: 'r',
      solution: 'x',
    });
    expect(listBugs(db)[0]).toMatchObject({ symptom: 's', rootCause: 'r', solution: 'x' });
  });

  it('CP-09-05: editing a missing bug reports not_found', () => {
    expect(updateBug(db, 99, { title: 'a' })).toEqual({ ok: false, error: 'not_found' });
    expect(updateBug(db, 'x', { title: 'a' })).toEqual({ ok: false, error: 'not_found' });
  });

  it('CP-09-06: severity defaults to medium and high/medium/low are stored', () => {
    const result = createBug(db, { title: 'sin severidad' });
    expect(result.ok && result.bug.severity).toBe('medium');
    for (const severity of ['high', 'low', 'medium'] as const) {
      const bug = make(severity, { severity });
      expect(bug.severity).toBe(severity);
    }
  });

  it('CP-09-07: the status moves freely among the four values, including reopening', () => {
    const bug = make('a');
    for (const status of ['analysis', 'resolved', 'verified', 'analysis', 'new'] as const) {
      const result = setBugStatus(db, bug.id, status);
      expect(result.ok && result.bug.status).toBe(status);
      expect(listBugs(db)[0].status).toBe(status);
    }
  });

  it('CP-09-07: changing the status of a missing bug reports not_found', () => {
    expect(setBugStatus(db, 5, 'resolved')).toEqual({ ok: false, error: 'not_found' });
  });

  it('CP-09-08: main rejects a status outside the allowed values', () => {
    const bug = make('a');
    for (const status of ['closed', '', null, 3, undefined]) {
      expect(setBugStatus(db, bug.id, status)).toEqual({ ok: false, error: 'invalid' });
    }
    expect(listBugs(db)[0].status).toBe('new');
  });

  it('CP-09-08: main rejects a severity outside the allowed values', () => {
    expect(createBug(db, { title: 'a', severity: 'critical' })).toEqual({
      ok: false,
      error: 'invalid',
    });
    const bug = make('b');
    expect(updateBug(db, bug.id, { title: 'b', severity: 7 })).toEqual({
      ok: false,
      error: 'invalid',
    });
    expect(listBugs(db)).toHaveLength(1);
  });

  it('CP-09-08: the table itself refuses values outside the allowed ones', () => {
    expect(() =>
      db
        .prepare(
          "INSERT INTO bugs (title, status, created_at, updated_at) VALUES ('a', 'closed', '', '')",
        )
        .run(),
    ).toThrow();
  });

  it('CP-09-11: deleting removes the bug; an unknown id deletes nothing', () => {
    const bug = make('a');
    expect(deleteBug(db, 999)).toBe(false);
    expect(deleteBug(db, 'x')).toBe(false);
    expect(deleteBug(db, bug.id)).toBe(true);
    expect(listBugs(db)).toEqual([]);
  });

  it('CP-09-13: the bugs table comes from a new migration after the existing ones', () => {
    const migration = migrations.find((m) => m.name === 'bugs');
    expect(migration).toBeDefined();
    expect(migration!.version).toBe(9);
    expect(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'bugs'").get()).toBeDefined();
  });

  it('lists the newest bug first', () => {
    make('a');
    make('b');
    expect(listBugs(db).map((b) => b.code)).toEqual(['BUG-2', 'BUG-1']);
  });
});
