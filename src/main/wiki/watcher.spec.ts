import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../db/database';
import { createNote, deleteNote, listNotes, listSections, updateNote, type Wiki } from './wiki';
import { createWikiSync, type WikiSync } from './watcher';

const DEBOUNCE = 40;

describe('wiki watcher', () => {
  let root: string;
  let db: Database.Database;
  let wiki: Wiki;
  let sync: WikiSync | null = null;
  const onChange = vi.fn();

  const start = (options: Partial<Parameters<typeof createWikiSync>[1]> = {}): WikiSync => {
    sync = createWikiSync(wiki, { onChange, debounceMs: DEBOUNCE, maxWaitMs: 1000, ...options });
    sync.start();
    return sync;
  };
  const write = (rel: string, text: string): void => {
    const file = path.join(wiki.dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  const titles = (): string[] => listNotes(wiki).map((n) => n.title);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-watch-'));
    db = openDatabase(root);
    wiki = { db, dir: path.join(root, 'wiki') };
    onChange.mockReset();
  });

  afterEach(() => {
    sync?.stop();
    sync = null;
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('CP-08-102: adding, editing, renaming and deleting a .md outside updates the index', async () => {
    write('Uno.md', '---\ntitle: "Uno"\n---\n\nHola [[Dos]]');
    start();
    expect(titles()).toEqual(['Uno']);

    write('Dos.md', '---\ntitle: "Dos"\n---\n\nTexto');
    await vi.waitFor(() => expect(titles()).toEqual(['Dos', 'Uno']));
    expect(onChange).toHaveBeenCalled();

    // backlinks follow the disk
    write('Dos.md', '---\ntitle: "Dos"\n---\n\nTexto [[Uno]]');
    await vi.waitFor(() => {
      const backlinks = db
        .prepare('SELECT COUNT(*) AS n FROM note_links WHERE key = ?')
        .get('uno') as { n: number };
      expect(backlinks.n).toBe(1);
    });

    fs.renameSync(path.join(wiki.dir, 'Dos.md'), path.join(wiki.dir, 'Tres.md'));
    await vi.waitFor(() => expect(listNotes(wiki).map((n) => n.slug)).toEqual(['Tres', 'Uno']));

    fs.rmSync(path.join(wiki.dir, 'Uno.md'));
    await vi.waitFor(() => expect(listNotes(wiki).map((n) => n.slug)).toEqual(['Tres']));
  });

  it('CP-08-102: also notices files inside a section folder', async () => {
    write('Guías/A.md', '---\ntitle: "A"\n---\n\nx');
    start();
    write('Guías/B.md', '---\ntitle: "B"\n---\n\ny');
    await vi.waitFor(() => expect(titles()).toEqual(['A', 'B']));
    fs.rmSync(path.join(wiki.dir, 'Guías', 'B.md'));
    await vi.waitFor(() => expect(titles()).toEqual(['A']));
  });

  it('CP-08-103: a section folder appears and disappears with its files; an empty one is not a section', async () => {
    start();
    fs.mkdirSync(path.join(wiki.dir, 'Vacía'));
    await new Promise((r) => setTimeout(r, DEBOUNCE * 4));
    expect(listSections(wiki)).toEqual([]);

    write('Nueva/Página.md', '---\ntitle: "Página"\n---\n\nx');
    await vi.waitFor(() => expect(listSections(wiki).map((s) => s.name)).toEqual(['Nueva']));

    fs.rmSync(path.join(wiki.dir, 'Nueva'), { recursive: true });
    await vi.waitFor(() => expect(listSections(wiki)).toEqual([]));
    expect(onChange).toHaveBeenCalled();
  });

  it('CP-08-104: 50 files written in a burst rebuild the index a bounded number of times', async () => {
    start();
    for (let i = 0; i < 50; i++) write(`N${i}.md`, `---\ntitle: "N${i}"\n---\n\nx`);
    await vi.waitFor(() => expect(listNotes(wiki)).toHaveLength(50));
    await new Promise((r) => setTimeout(r, DEBOUNCE * 4));
    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(onChange.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('CP-08-104: a burst that never calms down is still flushed after the maximum wait', async () => {
    vi.useFakeTimers();
    try {
      let emit: () => void = () => undefined;
      const watch = vi.fn((_dir: string, _o: unknown, listener: () => void) => {
        emit = listener;
        return { close: vi.fn(), on: vi.fn() };
      });
      start({ watch: watch as never, debounceMs: 500, maxWaitMs: 2000 });
      write('Nueva.md', '---\ntitle: "Nueva"\n---\n\nx');
      for (let t = 0; t < 3000; t += 100) {
        emit();
        await vi.advanceTimersByTimeAsync(100);
      }
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(titles()).toEqual(['Nueva']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('CP-08-105: saving, creating, renaming and deleting from the app is not an outside change', async () => {
    const s = start();
    createNote(wiki, { title: 'Mía', content: 'a' });
    s.markSynced();
    updateNote(wiki, 'Mía', { title: 'Mía', content: 'b' });
    s.markSynced();
    updateNote(wiki, 'Mía', { title: 'Renombrada', content: 'b' });
    s.markSynced();
    createNote(wiki, { title: 'Otra', content: '', section: 'Guías' });
    s.markSynced();
    deleteNote(wiki, 'Guías/Otra');
    s.markSynced();
    await new Promise((r) => setTimeout(r, DEBOUNCE * 5));
    expect(onChange).not.toHaveBeenCalled();
    expect(titles()).toEqual(['Renombrada']);
  });

  it('CP-08-105: a section created by the app gets watched too', async () => {
    const s = start();
    createNote(wiki, { title: 'Dentro', content: '', section: 'Nueva' });
    s.markSynced();
    write('Nueva/Fuera.md', '---\ntitle: "Fuera"\n---\n\nx');
    await vi.waitFor(() => expect(titles()).toEqual(['Dentro', 'Fuera']));
  });

  it('CP-08-87: a note added outside in a nested folder is picked up, and a folder created inside is watched', async () => {
    write('A/B/Uno.md', '---\ntitle: "Uno"\n---\n\nx');
    start();
    expect(listNotes(wiki).map((n) => n.slug)).toEqual(['A/B/Uno']);

    write('A/B/Dos.md', '---\ntitle: "Dos"\n---\n\nx');
    await vi.waitFor(() => expect(titles()).toEqual(['Dos', 'Uno']));
    write('A/B/C/Tres.md', '---\ntitle: "Tres"\n---\n\nx');
    await vi.waitFor(() => expect(titles()).toEqual(['Dos', 'Tres', 'Uno']));
    write('A/B/C/Cuatro.md', '---\ntitle: "Cuatro"\n---\n\nx');
    await vi.waitFor(() => expect(titles()).toContain('Cuatro'));
  });

  it('CP-08-110: reports the files left out of the index with the reason', () => {
    write('Uno.md', '---\ntitle: "Mismo"\n---\n\nx');
    write('Dos.md', '---\ntitle: "Mismo"\n---\n\ny');
    write('con:dos.md', 'x');
    const s = start();
    expect(s.skipped()).toEqual(
      expect.arrayContaining([
        { file: 'Uno.md', reason: 'duplicate' },
        { file: 'con:dos.md', reason: 'invalid_name' },
      ]),
    );
    expect(s.skipped()).toHaveLength(2);
  });

  it('CP-08-112: stop closes every watcher and leaves no timer; at rest nothing runs', async () => {
    vi.useFakeTimers();
    try {
      const closes: ReturnType<typeof vi.fn>[] = [];
      let emit: () => void = () => undefined;
      const watch = vi.fn((_dir: string, _o: unknown, listener: () => void) => {
        emit = listener;
        const close = vi.fn();
        closes.push(close);
        return { close, on: vi.fn() };
      });
      write('Guías/A.md', '---\ntitle: "A"\n---\n\nx');
      const s = start({ watch: watch as never });
      expect(watch).toHaveBeenCalledTimes(2); // wiki/ and Guías/
      expect(vi.getTimerCount()).toBe(0); // at rest: nothing scheduled
      await vi.advanceTimersByTimeAsync(60_000);
      expect(onChange).not.toHaveBeenCalled();

      emit();
      expect(vi.getTimerCount()).toBe(1);
      s.stop();
      expect(vi.getTimerCount()).toBe(0);
      expect(closes).toHaveLength(2);
      for (const close of closes) expect(close).toHaveBeenCalledTimes(1);
      s.stop(); // twice is harmless
    } finally {
      vi.useRealTimers();
    }
  });
});
