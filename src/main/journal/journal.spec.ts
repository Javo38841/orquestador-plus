import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import { listJournal, saveJournalEntry } from './journal';

describe('journal', () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-journal-'));
    db = openDatabase(dir);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('CP-12-01: saving text for a date without an entry creates it', () => {
    const result = saveJournalEntry(db, '2026-03-01', 'Hice X');
    expect(result).toMatchObject({ ok: true, entry: { date: '2026-03-01', text: 'Hice X' } });
    expect(listJournal(db)).toMatchObject([{ date: '2026-03-01', text: 'Hice X' }]);
  });

  it('CP-12-02: saving again for the same date updates it instead of adding a second entry', () => {
    saveJournalEntry(db, '2026-03-01', 'uno');
    saveJournalEntry(db, '2026-03-01', 'dos');
    const entries = listJournal(db);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('dos');
  });

  it('CP-12-03: lists entries from the most recent day to the oldest', () => {
    saveJournalEntry(db, '2026-03-02', 'b');
    saveJournalEntry(db, '2026-03-10', 'c');
    saveJournalEntry(db, '2026-02-28', 'a');
    expect(listJournal(db).map((e) => e.date)).toEqual(['2026-03-10', '2026-03-02', '2026-02-28']);
  });

  it.each([
    ['not a date', 'x'],
    ['2026-3-1', 'x'],
    ['2026-02-30', 'x'],
    ['2026-13-01', 'x'],
    [20260301, 'x'],
    [null, 'x'],
    ['2026-03-01', 42],
    ['2026-03-01', null],
    ['2026-03-01', undefined],
  ])('CP-12-04: rejects the invalid payload (%j, %j) and writes nothing', (date, text) => {
    expect(saveJournalEntry(db, date, text)).toEqual({ ok: false, error: 'invalid' });
    expect(listJournal(db)).toEqual([]);
  });

  it('CP-12-04: rejects an oversized text and keeps the existing entry', () => {
    saveJournalEntry(db, '2026-03-01', 'ok');
    expect(saveJournalEntry(db, '2026-03-01', 'x'.repeat(50_001))).toEqual({
      ok: false,
      error: 'too_long',
    });
    expect(listJournal(db)[0].text).toBe('ok');
  });

  it('CP-12-05: a blank text deletes the entry of a day that had one', () => {
    saveJournalEntry(db, '2026-03-01', 'algo');
    saveJournalEntry(db, '2026-03-02', 'otro');
    expect(saveJournalEntry(db, '2026-03-01', '  \n ')).toEqual({ ok: true, entry: null });
    expect(listJournal(db).map((e) => e.date)).toEqual(['2026-03-02']);
  });

  it('CP-12-05: a blank text for a day without an entry creates nothing', () => {
    expect(saveJournalEntry(db, '2026-03-01', '')).toEqual({ ok: true, entry: null });
    expect(listJournal(db)).toEqual([]);
  });
});
