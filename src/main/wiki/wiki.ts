import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import {
  extractLinks,
  isValidSlug,
  noteKey,
  slugFromTitle,
  validateNoteInput,
  type Note,
  type NoteError,
  type NoteResult,
  type NoteSummary,
} from '../../shared/wiki';

/** The wiki: Markdown files in `dir` (source of truth) indexed in SQLite. */
export interface Wiki {
  db: Database.Database;
  dir: string;
}

interface NoteRow {
  id: number;
  slug: string;
  title: string;
  created_at: string;
  updated_at: string;
}

class WikiError extends Error {
  constructor(readonly code: NoteError) {
    super(code);
  }
}

const EXTENSION = '.md';
const TEMP_SUFFIX = '.tmp';

function toSummary(row: NoteRow): NoteSummary {
  return { slug: row.slug, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at };
}

function filePath(wiki: Wiki, slug: string): string {
  const resolved = path.resolve(wiki.dir, slug + EXTENSION);
  // Defense in depth: slugs are validated, but a note must never leave wiki/.
  if (path.dirname(resolved) !== path.resolve(wiki.dir)) throw new WikiError('invalid');
  return resolved;
}

/** Temp file next to the target; its name never ends in `.md`, so it is never a note. */
function tempPath(target: string): string {
  return path.join(path.dirname(target), `.${path.basename(target)}${TEMP_SUFFIX}`);
}

/**
 * Writes through a temp file in the same folder and renames it over `target`, so a crash
 * or a full disk never leaves a half-written note (RNF-08). The temp file is removed on failure.
 */
function writeFileAtomic(target: string, data: string): void {
  const temp = tempPath(target);
  try {
    fs.writeFileSync(temp, data);
    fs.renameSync(temp, target);
  } catch (error) {
    fs.rmSync(temp, { force: true });
    throw error;
  }
}

/** Notes are always written with `\n` line endings, whatever the editor or system sent. */
function toLf(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

export function serializeNote(
  title: string,
  createdAt: string,
  updatedAt: string,
  content: string,
): string {
  return `---\ntitle: ${JSON.stringify(title)}\ncreated: ${createdAt}\nupdated: ${updatedAt}\n---\n\n${toLf(content)}`;
}

export interface ParsedNote {
  title: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  content: string;
}

/** Reads the frontmatter written by `serializeNote`; tolerates files without it. */
export function parseNote(raw: string): ParsedNote {
  const text = raw.replace(/^\uFEFF/, ''); // a BOM added by a Windows editor
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) return { title: null, createdAt: null, updatedAt: null, content: text };
  const fields = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const m = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (m) fields.set(m[1], m[2].trim());
  }
  const read = (name: string): string | null => {
    const raw = fields.get(name);
    if (raw === undefined || raw === '') return null;
    if (raw.startsWith('"')) {
      try {
        const value: unknown = JSON.parse(raw);
        return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
      } catch {
        return null;
      }
    }
    return raw.replace(/^'(.*)'$/, '$1');
  };
  const date = (name: string): string | null => {
    const value = read(name);
    return value !== null && !Number.isNaN(Date.parse(value)) ? value : null;
  };
  return {
    title: read('title'),
    createdAt: date('created'),
    updatedAt: date('updated'),
    content: text.slice(match[0].length).replace(/^\r?\n/, ''),
  };
}

function indexLinks(db: Database.Database, noteId: number, content: string): void {
  db.prepare('DELETE FROM note_links WHERE note_id = ?').run(noteId);
  const insert = db.prepare('INSERT INTO note_links (note_id, key, label) VALUES (?, ?, ?)');
  for (const link of extractLinks(content)) insert.run(noteId, link.key, link.label);
}

function findBySlug(db: Database.Database, slug: string): NoteRow | undefined {
  return db.prepare('SELECT * FROM notes WHERE slug = ?').get(slug) as NoteRow | undefined;
}

/** True if another note (not `selfId`) already uses this title or file name. */
function conflicts(wiki: Wiki, selfId: number, slug: string, key: string): boolean {
  const clash = wiki.db
    .prepare('SELECT 1 FROM notes WHERE id != ? AND (title_key = ? OR slug = ? COLLATE NOCASE)')
    .get(selfId, key, slug);
  return clash !== undefined;
}

function failure(error: unknown): { ok: false; error: NoteError } {
  if (error instanceof WikiError) return { ok: false, error: error.code };
  return { ok: false, error: 'io' };
}

/** Notes sorted by title. */
export function listNotes(wiki: Wiki): NoteSummary[] {
  const rows = wiki.db.prepare('SELECT * FROM notes ORDER BY title_key').all() as NoteRow[];
  return rows.map(toSummary);
}

export function getNote(wiki: Wiki, slug: unknown): NoteResult {
  if (!isValidSlug(slug)) return { ok: false, error: 'invalid' };
  const row = findBySlug(wiki.db, slug);
  if (!row) return { ok: false, error: 'not_found' };
  let text: string;
  try {
    text = fs.readFileSync(filePath(wiki, row.slug), 'utf8');
  } catch {
    return { ok: false, error: 'not_found' };
  }
  const links = wiki.db
    .prepare(
      `SELECT l.label, l.key, n.slug FROM note_links l
       LEFT JOIN notes n ON n.title_key = l.key
       WHERE l.note_id = ? ORDER BY l.rowid`,
    )
    .all(row.id) as { label: string; key: string; slug: string | null }[];
  const backlinks = wiki.db
    .prepare(
      `SELECT n.* FROM note_links l JOIN notes n ON n.id = l.note_id
       WHERE l.key = (SELECT title_key FROM notes WHERE id = ?) AND n.id != ?
       ORDER BY n.title_key`,
    )
    .all(row.id, row.id) as NoteRow[];
  const note: Note = {
    ...toSummary(row),
    content: parseNote(text).content,
    links,
    backlinks: backlinks.map(toSummary),
  };
  return { ok: true, note };
}

/**
 * Creates the file in `wiki/` and indexes it. A title or file name already in use is
 * rejected as `duplicate`.
 */
export function createNote(wiki: Wiki, input: unknown, now: Date = new Date()): NoteResult {
  const checked = validateNoteInput(input);
  if (!checked.ok) return checked;
  const slug = slugFromTitle(checked.title);
  const key = noteKey(checked.title);
  const stamp = now.toISOString();

  try {
    fs.mkdirSync(wiki.dir, { recursive: true });
    wiki.db.transaction(() => {
      if (conflicts(wiki, 0, slug, key)) throw new WikiError('duplicate');
      const info = wiki.db
        .prepare(
          'INSERT INTO notes (slug, title, title_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(slug, checked.title, key, stamp, stamp);
      indexLinks(wiki.db, Number(info.lastInsertRowid), toLf(checked.content));
      const target = filePath(wiki, slug);
      // A file left over without index entry also counts as taken.
      if (fs.existsSync(target)) throw new WikiError('duplicate');
      writeFileAtomic(target, serializeNote(checked.title, stamp, stamp, checked.content));
    })();
  } catch (error) {
    return failure(error);
  }
  return getNote(wiki, slug);
}

/** True when both paths are physically the same file (case-insensitive file systems). */
function isSameFile(a: string, b: string): boolean {
  try {
    const sa = fs.statSync(a);
    const sb = fs.statSync(b);
    return sa.dev === sb.dev && sa.ino === sb.ino;
  } catch {
    return false;
  }
}

/**
 * Rewrites the note. Changing the title renames the file; links that pointed at the old
 * title become pending. File and index change together: a failure rolls the index back.
 */
export function updateNote(
  wiki: Wiki,
  slug: unknown,
  input: unknown,
  now: Date = new Date(),
): NoteResult {
  if (!isValidSlug(slug)) return { ok: false, error: 'invalid' };
  const checked = validateNoteInput(input);
  if (!checked.ok) return checked;
  const current = findBySlug(wiki.db, slug);
  if (!current) return { ok: false, error: 'not_found' };

  const key = noteKey(checked.title);
  const renamed = checked.title !== current.title;
  const nextSlug = renamed ? slugFromTitle(checked.title) : current.slug;
  const stamp = now.toISOString();
  let written = false;
  let sameFile = false;

  try {
    wiki.db.transaction(() => {
      if (conflicts(wiki, current.id, nextSlug, key)) throw new WikiError('duplicate');
      const target = filePath(wiki, nextSlug);
      sameFile = isSameFile(filePath(wiki, current.slug), target);
      if (nextSlug !== current.slug && !sameFile && fs.existsSync(target)) {
        throw new WikiError('duplicate');
      }
      wiki.db
        .prepare('UPDATE notes SET slug = ?, title = ?, title_key = ?, updated_at = ? WHERE id = ?')
        .run(nextSlug, checked.title, key, stamp, current.id);
      indexLinks(wiki.db, current.id, checked.content);
      writeFileAtomic(
        target,
        serializeNote(checked.title, current.created_at, stamp, checked.content),
      );
      written = true;
      if (nextSlug !== current.slug && !sameFile) fs.rmSync(filePath(wiki, current.slug));
    })();
  } catch (error) {
    if (written && nextSlug !== current.slug && !sameFile)
      fs.rmSync(filePath(wiki, nextSlug), { force: true });
    return failure(error);
  }
  return getNote(wiki, nextSlug);
}

/** Deletes file and index entry together; notes that linked to it keep a pending link. */
export function deleteNote(wiki: Wiki, slug: unknown): boolean {
  if (!isValidSlug(slug)) return false;
  const row = findBySlug(wiki.db, slug);
  if (!row) return false;
  wiki.db.transaction(() => {
    wiki.db.prepare('DELETE FROM notes WHERE id = ?').run(row.id);
    fs.rmSync(filePath(wiki, row.slug), { force: true });
  })();
  return true;
}

/** Deletes temp files left in `wiki/` by a crash in the middle of a save. */
function removeOrphanTempFiles(dir: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      entry.name.startsWith('.') &&
      entry.name.endsWith(EXTENSION + TEMP_SUFFIX)
    ) {
      fs.rmSync(path.join(dir, entry.name), { force: true });
    }
  }
}

/**
 * Rebuilds the whole index from the files in `wiki/` (ADR-001): run at startup, so a
 * deleted `datos.db` loses nothing. A file that cannot be read, or whose title or name clashes
 * with an earlier one, is left out of the index (and untouched on disk).
 */
export function rebuildIndex(wiki: Wiki): number {
  fs.mkdirSync(wiki.dir, { recursive: true });
  removeOrphanTempFiles(wiki.dir);
  const names = fs
    .readdirSync(wiki.dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(EXTENSION))
    .map((e) => e.name.slice(0, -EXTENSION.length))
    .filter((slug) => isValidSlug(slug))
    .sort();

  return wiki.db.transaction(() => {
    wiki.db.prepare('DELETE FROM notes').run();
    const insert = wiki.db.prepare(
      'INSERT INTO notes (slug, title, title_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    );
    const slugs = new Set<string>();
    const keys = new Set<string>();
    let count = 0;
    for (const slug of names) {
      const file = filePath(wiki, slug);
      let text: string;
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch {
        continue; // an unreadable file must not abort the whole rebuild
      }
      const parsed = parseNote(text);
      const title = parsed.title ?? slug;
      const key = noteKey(title);
      const slugKey = slug.normalize('NFC').toLowerCase();
      if (slugs.has(slugKey) || keys.has(key)) continue;
      slugs.add(slugKey);
      keys.add(key);
      const mtime = fs.statSync(file).mtime.toISOString();
      const info = insert.run(
        slug,
        title,
        key,
        parsed.createdAt ?? mtime,
        parsed.updatedAt ?? parsed.createdAt ?? mtime,
      );
      indexLinks(wiki.db, Number(info.lastInsertRowid), parsed.content);
      count++;
    }
    return count;
  })();
}
