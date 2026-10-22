import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import {
  getBoardPanelOpen,
  getBoardProject,
  getRemindersEnabled,
  setBoardPanelOpen,
  setBoardProject,
  setRemindersEnabled,
} from './settings';

describe('settings', () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-settings-'));
    db = openDatabase(dir);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reminders are enabled by default', () => {
    expect(getRemindersEnabled(db)).toBe(true);
  });

  it('persists the reminders switch', () => {
    expect(setRemindersEnabled(db, false)).toBe(false);
    expect(getRemindersEnabled(db)).toBe(false);
    setRemindersEnabled(db, true);
    expect(getRemindersEnabled(db)).toBe(true);
  });

  it('rejects a value that is not a boolean', () => {
    expect(() => setRemindersEnabled(db, 'no')).toThrow();
    expect(getRemindersEnabled(db)).toBe(true);
  });

  it('CP-04-12: the last board is stored, and "General" is the default and can be restored', () => {
    expect(getBoardProject(db)).toBe('general');
    expect(setBoardProject(db, { projectId: 7 })).toEqual({ projectId: 7 });
    expect(getBoardProject(db)).toEqual({ projectId: 7 });
    expect(setBoardProject(db, 'general')).toBe('general');
    expect(getBoardProject(db)).toBe('general');
  });

  it('CP-04-14: "Sueltas" is stored as text and a value saved by the previous version still works', () => {
    expect(setBoardProject(db, 'loose')).toBe('loose');
    expect(getBoardProject(db)).toBe('loose');
    const raw = db.prepare('SELECT value FROM settings WHERE key = ?').get('board.project');
    expect(raw).toEqual({ value: 'loose' });
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('12', 'board.project');
    expect(getBoardProject(db)).toEqual({ projectId: 12 });
    db.prepare('DELETE FROM settings WHERE key = ?').run('board.project');
    expect(getBoardProject(db)).toBe('general');
  });

  it('CP-04-15: accepts only "general", "loose" or an integer project id', () => {
    const bad = [
      null,
      '3',
      'Sueltas',
      1.5,
      7,
      undefined,
      {},
      { projectId: '3' },
      { projectId: 1.5 },
    ];
    for (const value of bad) expect(() => setBoardProject(db, value)).toThrow();
    expect(() => setBoardProject(db, { projectId: 1, extra: 1 })).toThrow();
    expect(getBoardProject(db)).toBe('general');
  });

  it('CP-04-15: a corrupt stored setting opens the board in "General"', () => {
    for (const value of ['', 'abc', '1.5', 'null', 'LOOSE', '{"projectId":1}']) {
      db.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      ).run('board.project', value);
      expect(getBoardProject(db)).toBe('general');
    }
  });

  it('CP-04-24: the projects panel is open by default, remembers being folded and rejects non-booleans', () => {
    expect(getBoardPanelOpen(db)).toBe(true);
    expect(setBoardPanelOpen(db, false)).toBe(false);
    expect(getBoardPanelOpen(db)).toBe(false);
    setBoardPanelOpen(db, true);
    expect(getBoardPanelOpen(db)).toBe(true);
    expect(() => setBoardPanelOpen(db, 'no')).toThrow();
    expect(getBoardPanelOpen(db)).toBe(true);
  });
});
