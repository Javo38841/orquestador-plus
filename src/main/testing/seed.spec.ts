import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../db/database';
import { captureItem } from '../inbox/inbox';
import { createReminderScheduler } from '../reminders/scheduler';
import { search } from '../search/search';
import { createTask, deleteTask, updateTask } from '../tasks/tasks';
import { rebuildIndex } from '../wiki/wiki';
import { MAX_SEARCH_RESULTS } from '../../shared/search';
import { DEFAULT_SEED, scaleVolume, seedDatabase, YEARS_OF_USE } from './seed';

vi.mock('../channel', () => ({ CHANNEL: 'dev' }));

/**
 * RNF-05 thresholds. CI machines are slower and noisier than a laptop, so the figures are the
 * approved ones and the checks use medians; they fail on a real regression, not on a hiccup.
 */
const SEARCH_MEDIAN_MS = 100;
const WRITE_MS = 50;
const OPEN_DATABASE_MS = 1000;
const RUNS = 20;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function medianMs(run: () => void): number {
  run(); // warm-up: prepares statements and fills the page cache like a real session
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  return median(times);
}

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

function count(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

function snapshot(db: Database.Database): unknown {
  return {
    tasks: db.prepare('SELECT title, status, due_date FROM tasks ORDER BY id LIMIT 50').all(),
    bugs: db.prepare('SELECT title, severity FROM bugs ORDER BY id LIMIT 50').all(),
    journal: db.prepare('SELECT date, text FROM journal_entries ORDER BY date LIMIT 50').all(),
  };
}

describe('RNF-05 performance with years of data', () => {
  let root: string;
  let dir: string;
  let db: Database.Database;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-perf-'));
    dir = path.join(root, 'big');
    db = openDatabase(dir);
    seedDatabase(db, dir, YEARS_OF_USE);
  }, 120_000);

  afterAll(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('CP-N05-01: the generator creates the "years of use" volume with the index populated', () => {
    expect(count(db, 'tasks')).toBe(5000);
    expect(count(db, 'notes')).toBe(2000);
    expect(count(db, 'bugs')).toBe(1000);
    expect(count(db, 'journal_entries')).toBe(3000);
    expect(count(db, 'inbox_items')).toBeGreaterThan(0);
    expect(count(db, 'snippets')).toBeGreaterThan(0);
    expect(fs.readdirSync(path.join(dir, 'wiki'))).toHaveLength(2000);
    const indexed = db
      .prepare("SELECT COUNT(*) AS n FROM search_index WHERE kind = 'task'")
      .get() as { n: number };
    expect(indexed.n).toBe(5000);
    expect(count(db, 'search_index')).toBe(5000 + count(db, 'inbox_items'));
  });

  it('CP-N05-01: the same seed gives the same data, another seed does not', () => {
    const volume = scaleVolume(YEARS_OF_USE, 0.01);
    const build = (name: string, seed?: number) => {
      const d = path.join(root, name);
      const small = openDatabase(d);
      seedDatabase(small, d, volume, seed);
      const result = snapshot(small);
      small.close();
      return result;
    };

    const first = build('a', DEFAULT_SEED);
    expect(build('b', DEFAULT_SEED)).toEqual(first);
    expect(build('c', DEFAULT_SEED + 1)).not.toEqual(first);
  });

  it(`CP-N05-02: a common term answers in under ${SEARCH_MEDIAN_MS} ms (median of ${RUNS}) within the RF-10 limit`, () => {
    const results = search(db, 'informe');
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(MAX_SEARCH_RESULTS);

    expect(medianMs(() => search(db, 'informe'))).toBeLessThan(SEARCH_MEDIAN_MS);
  });

  it.each([
    ['a single-letter prefix', 'a'],
    ['a term with no matches', 'zzzxqwv'],
    ['a term with accents and capitals', 'REUNIÓN'],
  ])('CP-N05-03: %s answers under the threshold without error', (_label, term) => {
    let results: ReturnType<typeof search> = [];
    expect(medianMs(() => (results = search(db, term)))).toBeLessThan(SEARCH_MEDIAN_MS);
    expect(results.length).toBeLessThanOrEqual(MAX_SEARCH_RESULTS);
    if (term === 'zzzxqwv') expect(results).toEqual([]);
    else expect(results.length).toBeGreaterThan(0);
  });

  it(`CP-N05-04: create, edit and delete are searchable at once and take under ${WRITE_MS} ms (median of ${RUNS})`, () => {
    const created: number[] = [];
    const edited: number[] = [];
    const deleted: number[] = [];
    const captured: number[] = [];

    for (let i = 0; i < RUNS; i++) {
      let id = 0;
      created.push(
        elapsedMs(() => {
          const r = createTask(db, { title: 'Quimerazo único de rendimiento' });
          if (!r.ok) throw new Error('create');
          id = r.task.id;
        }),
      );
      expect(search(db, 'quimerazo').map((r) => r.id)).toEqual([id]);

      edited.push(
        elapsedMs(() => {
          updateTask(db, id, { title: 'Zarandaja único de rendimiento' });
        }),
      );
      expect(search(db, 'quimerazo')).toEqual([]);
      expect(search(db, 'zarandaja').map((r) => r.id)).toEqual([id]);

      deleted.push(
        elapsedMs(() => {
          deleteTask(db, id);
        }),
      );
      expect(search(db, 'zarandaja')).toEqual([]);

      captured.push(
        elapsedMs(() => {
          captureItem(db, 'Captura única de rendimiento');
        }),
      );
      expect(search(db, 'captura unica')).toHaveLength(i + 1);
    }

    for (const times of [created, edited, deleted, captured]) {
      expect(median(times)).toBeLessThan(WRITE_MS);
    }
  });

  it(`CP-N05-05: opening the database and starting main's services takes under ${OPEN_DATABASE_MS} ms`, () => {
    // Fresh connection on the same files, as on app start.
    const copy = path.join(root, 'startup');
    fs.cpSync(dir, copy, { recursive: true });
    let opened: Database.Database | undefined;
    const elapsed = elapsedMs(() => {
      opened = openDatabase(copy);
      rebuildIndex({ db: opened, dir: path.join(copy, 'wiki') });
      const reminders = createReminderScheduler({ db: opened, notify: () => undefined });
      reminders.start();
      reminders.stop();
    });
    opened!.close();

    expect(elapsed).toBeLessThan(OPEN_DATABASE_MS);
  });
});
