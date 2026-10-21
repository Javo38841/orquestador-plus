import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import {
  createNote,
  deleteNote,
  getNote,
  listNotes,
  parseNote,
  rebuildIndex,
  updateNote,
  type Wiki,
} from './wiki';

describe('wiki', () => {
  let root: string;
  let db: Database.Database;
  let wiki: Wiki;

  const create = (title: string, content = '', now = new Date('2026-03-01T10:00:00.000Z')) =>
    createNote(wiki, { title, content }, now);
  const note = (slug: string) => {
    const result = getNote(wiki, slug);
    if (!result.ok) throw new Error(`missing note ${slug}`);
    return result.note;
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-wiki-'));
    db = openDatabase(root);
    wiki = { db, dir: path.join(root, 'wiki') };
  });

  afterEach(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('CP-08-01: creating a note writes a .md file with frontmatter and indexes it', () => {
    const result = create('Guía de despliegue', 'Pasos del **deploy**.');

    expect(result.ok).toBe(true);
    const file = path.join(wiki.dir, 'Guía de despliegue.md');
    const parsed = parseNote(fs.readFileSync(file, 'utf8'));
    expect(parsed).toEqual({
      title: 'Guía de despliegue',
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
      content: 'Pasos del **deploy**.',
    });
    expect(fs.readFileSync(file, 'utf8').startsWith('---\ntitle: ')).toBe(true);
    expect(listNotes(wiki)).toEqual([
      {
        slug: 'Guía de despliegue',
        title: 'Guía de despliegue',
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z',
      },
    ]);
  });

  it('CP-08-02: editing rewrites the file, moves the update date and recomputes links', () => {
    create('A', 'ver [[B]]');
    const result = updateNote(
      wiki,
      'A',
      { title: 'A', content: 'ahora [[C]]' },
      new Date('2026-03-02T09:00:00.000Z'),
    );

    expect(result.ok).toBe(true);
    const saved = note('A');
    expect(saved.createdAt).toBe('2026-03-01T10:00:00.000Z');
    expect(saved.updatedAt).toBe('2026-03-02T09:00:00.000Z');
    expect(saved.links.map((l) => l.label)).toEqual(['C']);
    const onDisk = parseNote(fs.readFileSync(path.join(wiki.dir, 'A.md'), 'utf8'));
    expect(onDisk.content).toBe('ahora [[C]]');
    expect(onDisk.updatedAt).toBe('2026-03-02T09:00:00.000Z');
  });

  it('CP-08-03: a [[link]] is indexed and the target lists the note as a backlink', () => {
    create('Nota B');
    create('Nota A', 'Mira [[nota b]] para más.');

    expect(note('Nota A').links).toEqual([{ label: 'nota b', key: 'nota b', slug: 'Nota B' }]);
    expect(note('Nota B').backlinks.map((b) => b.slug)).toEqual(['Nota A']);
  });

  it('CP-08-04: a link to a missing note stays pending and resolves once it is created', () => {
    create('A', 'ver [[B]]');
    expect(note('A').links).toEqual([{ label: 'B', key: 'b', slug: null }]);

    create('B');

    expect(note('A').links[0].slug).toBe('B');
    expect(note('B').backlinks.map((b) => b.slug)).toEqual(['A']);
  });

  it('CP-08-05: repeated links count once and links in code are ignored', () => {
    create('B');
    const content = [
      '[[B]] y otra vez [[b]] y [[ B ]]',
      '`[[Inline]]`',
      '```',
      '[[Fenced]]',
      '```',
      '~~~',
      '[[Tilde]]',
      '~~~',
      '[[After]]',
    ].join('\n');
    create('A', content);

    expect(note('A').links.map((l) => l.key)).toEqual(['b', 'after']);
    expect(note('B').backlinks).toHaveLength(1);
    const rows = db.prepare('SELECT COUNT(*) AS n FROM note_links').get() as { n: number };
    expect(rows.n).toBe(2);
  });

  it('CP-08-06: unsafe characters are sanitized and the file never leaves wiki/', () => {
    for (const title of ['../../evil', 'a/b\\c:d', '..', 'CON']) {
      const result = create(title);
      expect(result.ok).toBe(true);
    }

    const files = fs.readdirSync(wiki.dir);
    expect(files).toHaveLength(4);
    for (const file of files) expect(file).not.toMatch(/[\\/:]|\.\./);
    expect(fs.existsSync(path.join(root, '..', 'evil.md'))).toBe(false);
  });

  it('CP-08-06: a duplicate title (any case) or colliding file name is rejected', () => {
    create('Guía');
    expect(create('guía')).toEqual({ ok: false, error: 'duplicate' });
    create('x-y');
    expect(create('x/y')).toEqual({ ok: false, error: 'duplicate' });
    expect(listNotes(wiki)).toHaveLength(2);
    expect(fs.readdirSync(wiki.dir)).toHaveLength(2);
  });

  it('CP-08-07: deleting a note removes file and index and leaves incoming links pending', () => {
    create('B');
    create('A', '[[B]]');

    expect(deleteNote(wiki, 'B')).toBe(true);

    expect(fs.existsSync(path.join(wiki.dir, 'B.md'))).toBe(false);
    expect(listNotes(wiki).map((n) => n.slug)).toEqual(['A']);
    expect(note('A').links).toEqual([{ label: 'B', key: 'b', slug: null }]);
    expect(deleteNote(wiki, 'B')).toBe(false);
  });

  it('CP-08-07: renaming moves the file and turns old incoming links pending', () => {
    create('B');
    create('A', '[[B]]');

    const result = updateNote(wiki, 'B', { title: 'B2', content: '' });

    expect(result.ok && result.note.slug).toBe('B2');
    expect(fs.existsSync(path.join(wiki.dir, 'B.md'))).toBe(false);
    expect(fs.existsSync(path.join(wiki.dir, 'B2.md'))).toBe(true);
    expect(note('A').links[0].slug).toBeNull();
    expect(note('B2').backlinks).toEqual([]);
  });

  it('CP-08-07: a failed rename to a taken title changes neither file nor index', () => {
    create('A');
    create('B', 'texto');

    expect(updateNote(wiki, 'B', { title: 'a', content: 'otro' })).toEqual({
      ok: false,
      error: 'duplicate',
    });
    expect(note('B').content).toBe('texto');
    expect(fs.existsSync(path.join(wiki.dir, 'B.md'))).toBe(true);
  });

  it('CP-08-08: deleting datos.db rebuilds the index and backlinks from wiki/', () => {
    create('B');
    create('A', '[[B]] [[Pendiente]]');
    db.close();
    for (const f of fs.readdirSync(root)) {
      if (f.startsWith('datos.db')) fs.rmSync(path.join(root, f));
    }

    db = openDatabase(root);
    wiki = { db, dir: wiki.dir };
    expect(listNotes(wiki)).toEqual([]);
    expect(rebuildIndex(wiki)).toBe(2);

    expect(listNotes(wiki).map((n) => n.slug)).toEqual(['A', 'B']);
    expect(note('B').backlinks.map((b) => b.slug)).toEqual(['A']);
    expect(note('A').links.map((l) => l.slug)).toEqual(['B', null]);
    expect(note('A').createdAt).toBe('2026-03-01T10:00:00.000Z');
  });

  it('CP-08-08: files without frontmatter or with clashing titles do not break the rebuild', () => {
    fs.mkdirSync(wiki.dir, { recursive: true });
    fs.writeFileSync(path.join(wiki.dir, 'Suelta.md'), 'solo texto [[Otra]]');
    fs.writeFileSync(path.join(wiki.dir, 'a.md'), '---\ntitle: "Mismo"\n---\n\nuno');
    fs.writeFileSync(path.join(wiki.dir, 'b.md'), '---\ntitle: "mismo"\n---\n\ndos');
    fs.writeFileSync(path.join(wiki.dir, 'notas.txt'), 'ignored');

    expect(rebuildIndex(wiki)).toBe(2);
    expect(listNotes(wiki).map((n) => n.title)).toEqual(['Mismo', 'Suelta']);
    expect(note('Suelta').content).toBe('solo texto [[Otra]]');
  });

  it('CP-08-09: invalid payloads are rejected without touching the disk', () => {
    const bad: unknown[] = [
      { title: '', content: '' },
      { title: '   ', content: '' },
      { title: 5, content: '' },
      { title: 'ok', content: 7 },
      { title: 'a\nb', content: '' },
      null,
      'texto',
    ];
    for (const input of bad) expect(createNote(wiki, input).ok).toBe(false);
    expect(fs.existsSync(wiki.dir)).toBe(false);

    create('A');
    const before = fs.readFileSync(path.join(wiki.dir, 'A.md'), 'utf8');
    for (const slug of ['../datos', '..', 'a/b', 'a\\b', '', 42, null]) {
      expect(getNote(wiki, slug)).toEqual({ ok: false, error: 'invalid' });
      expect(updateNote(wiki, slug, { title: 'X', content: '' })).toEqual({
        ok: false,
        error: 'invalid',
      });
      expect(deleteNote(wiki, slug)).toBe(false);
    }
    expect(updateNote(wiki, 'A', { title: '', content: 'x' })).toEqual({
      ok: false,
      error: 'empty',
    });
    expect(fs.readFileSync(path.join(wiki.dir, 'A.md'), 'utf8')).toBe(before);
    expect(fs.readdirSync(wiki.dir)).toEqual(['A.md']);
  });

  it('rejects titles over 200 characters and unknown notes', () => {
    expect(create('a'.repeat(201))).toEqual({ ok: false, error: 'too_long' });
    expect(getNote(wiki, 'Nada')).toEqual({ ok: false, error: 'not_found' });
    expect(updateNote(wiki, 'Nada', { title: 'x', content: '' })).toEqual({
      ok: false,
      error: 'not_found',
    });
  });

  it('keeps content that looks like frontmatter intact across edits', () => {
    const content = '---\nnot: meta\n---\n\ncuerpo\n';
    create('A', content);
    expect(note('A').content).toBe(content);
  });

  it('a link from a note to itself is not its own backlink', () => {
    create('A', '[[A]]');
    expect(note('A').backlinks).toEqual([]);
  });
});
