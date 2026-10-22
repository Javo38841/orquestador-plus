import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import {
  getBoardProject,
  getRemindersEnabled,
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
    expect(getBoardProject(db)).toBeNull();
    expect(setBoardProject(db, 7)).toBe(7);
    expect(getBoardProject(db)).toBe(7);
    expect(setBoardProject(db, null)).toBeNull();
    expect(getBoardProject(db)).toBeNull();
  });

  it('CP-04-12: rejects a board that is not an integer id or null', () => {
    for (const bad of ['3', 1.5, undefined, {}]) expect(() => setBoardProject(db, bad)).toThrow();
    expect(getBoardProject(db)).toBeNull();
  });
});
