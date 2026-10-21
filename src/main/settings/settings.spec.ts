import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import { getRemindersEnabled, setRemindersEnabled } from './settings';

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
});
