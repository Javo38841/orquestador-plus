import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import { createNote, getNote, rebuildIndex, rewriteNote, updateNote, type Wiki } from './wiki';

const T1 = new Date('2026-03-01T10:00:00.000Z');
const T2 = new Date('2026-03-02T10:00:00.000Z');

describe('wiki frontmatter preservation', () => {
  let root: string;
  let db: Database.Database;
  let wiki: Wiki;

  const file = (slug: string) => path.join(wiki.dir, `${slug}.md`);
  const write = (slug: string, text: string) => {
    fs.mkdirSync(wiki.dir, { recursive: true });
    fs.writeFileSync(file(slug), text);
    rebuildIndex(wiki);
  };
  const read = (slug: string) => fs.readFileSync(file(slug), 'utf8');
  const save = (slug: string, title: string, content: string) => {
    const result = updateNote(wiki, slug, { title, content }, T2);
    if (!result.ok) throw new Error(result.error);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-fm-'));
    db = openDatabase(root);
    wiki = { db, dir: path.join(root, 'wiki') };
  });
  afterEach(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const custom = [
    '---',
    'title: "Nota"',
    'tags:',
    '  - uno',
    "  - 'dos'",
    'aliases: [a, b]',
    "source: 'x'",
    'autor: "Ana"',
    'created: 2026-03-01T10:00:00.000Z',
    'updated: 2026-03-01T10:00:00.000Z',
    '---',
    '',
    'cuerpo',
  ].join('\n');

  it('CP-08-92: unknown keys keep their order, format and value; only updated changes', () => {
    write('nota', custom);
    save('nota', 'Nota', 'nuevo');
    expect(read('nota')).toBe(
      custom
        .replace('updated: 2026-03-01T10:00:00.000Z', 'updated: 2026-03-02T10:00:00.000Z')
        .replace('cuerpo', 'nuevo'),
    );
  });

  it('CP-08-93: YAML comments and blank lines between keys stay', () => {
    const text =
      '---\n# header\ntitle: "N"\n\ntags: [a]  # inline\n\ncreated: 2026-03-01T10:00:00.000Z\nupdated: 2026-03-01T10:00:00.000Z\n---\n\nx';
    write('n', text);
    save('n', 'N', 'y');
    expect(read('n')).toBe(
      text
        .replace('updated: 2026-03-01T10:00:00.000Z', 'updated: 2026-03-02T10:00:00.000Z')
        .replace('x', 'y'),
    );
  });

  it('CP-08-94: renaming keeps every other key in the new file', () => {
    write('nota', custom);
    save('nota', 'Otro', 'cuerpo');
    expect(fs.existsSync(file('nota'))).toBe(false);
    expect(read('Otro')).toBe(
      custom
        .replace('title: "Nota"', 'title: "Otro"')
        .replace('updated: 2026-03-01T10:00:00.000Z', 'updated: 2026-03-02T10:00:00.000Z'),
    );
  });

  it('CP-08-95: order and description are updated in place without reordering', () => {
    const text =
      '---\ntitle: "N"\ntags: [a]\norder: 3\ndescription: "vieja"\ncreated: 2026-03-01T10:00:00.000Z\nupdated: 2026-03-01T10:00:00.000Z\n---\n\nx';
    const out = rewriteNote(
      text,
      { title: 'N', created: 'c', updated: 'U', order: 7, description: 'nueva' },
      'x',
    );
    expect(out).toBe(
      '---\ntitle: "N"\ntags: [a]\norder: 7\ndescription: "nueva"\ncreated: 2026-03-01T10:00:00.000Z\nupdated: U\n---\n\nx',
    );
  });

  it('CP-08-96: the body is saved exactly as sent', () => {
    write('nota', custom);
    const body = 'a  \n\n\n| a | b |\n|---|---|\n---\nfin  \n\n';
    save('nota', 'Nota', body);
    expect(read('nota').endsWith('---\n\n' + body)).toBe(true);
    const result = getNote(wiki, 'nota');
    expect(result.ok && result.note.content).toBe(body);
  });

  it.each([
    ['broken YAML', '---\ntitle: "N"\nesto no es yaml\ntags: [a\n---\n\ncuerpo'],
    ['repeated keys', '---\ntitle: "N"\ntags: a\ntags: b\n---\n\ncuerpo'],
    ['unclosed quote', '---\ntitle: "N"\nsource: "abc\n---\n\ncuerpo'],
  ])('CP-08-97: %s keeps the original block and shows the body', (_name, text) => {
    write('nota', text);
    const opened = getNote(wiki, 'nota');
    expect(opened.ok && opened.note.content).toBe('cuerpo');
    save('nota', 'nota', 'editado');
    expect(read('nota')).toBe(text.replace('cuerpo', 'editado'));
  });

  it('CP-08-97: renaming a note with broken frontmatter renames only the file', () => {
    const text = '---\ntitle: "N"\ntags: a\ntags: b\n---\n\ncuerpo';
    write('n', text);
    save('n', 'Otro', 'cuerpo');
    expect(read('Otro')).toBe(text);
  });

  it('CP-08-98: a file without frontmatter gets a minimal one and the body is untouched', () => {
    write('plano', '# Hola\n\ntexto  \n');
    save('plano', 'plano', '# Hola\n\ntexto  \n');
    const lines = read('plano').split('\n');
    expect(lines.slice(0, 5)).toEqual([
      '---',
      'title: "plano"',
      expect.stringMatching(/^created: /),
      'updated: 2026-03-02T10:00:00.000Z',
      '---',
    ]);
    expect(read('plano').endsWith('---\n\n# Hola\n\ntexto  \n')).toBe(true);
  });

  it('CP-08-99: BOM is kept, CRLF becomes LF (RNF-12); missing title/updated are added', () => {
    const text = '﻿---\r\ntags: [a]\r\ncreated: 2026-03-01T10:00:00.000Z\r\n---\r\n\r\ncuerpo\r\n';
    write('crlf', text);
    save('crlf', 'crlf', 'cuerpo\r\n');
    expect(read('crlf')).toBe(
      '\uFEFF---\ntitle: "crlf"\ntags: [a]\ncreated: 2026-03-01T10:00:00.000Z\nupdated: 2026-03-02T10:00:00.000Z\n---\n\ncuerpo\n',
    );
  });

  it('CP-08-99: an existing updated line is replaced when the title is missing', () => {
    write('u', '---\ntags: [a]\nupdated: 2020-01-01\n---\n\nx');
    save('u', 'u', 'x');
    expect(read('u')).toBe(
      '---\ntitle: "u"\ntags: [a]\nupdated: 2026-03-02T10:00:00.000Z\n---\n\nx',
    );
  });

  it('CP-08-100: a new note is written with title, created and updated', () => {
    createNote(wiki, { title: 'Nueva', content: 'hola' }, T1);
    expect(read('Nueva')).toBe(
      '---\ntitle: "Nueva"\ncreated: 2026-03-01T10:00:00.000Z\nupdated: 2026-03-01T10:00:00.000Z\n---\n\nhola',
    );
  });
});
