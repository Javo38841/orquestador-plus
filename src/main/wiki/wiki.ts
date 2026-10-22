import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import {
  extractLinks,
  isValidSection,
  isValidSlug,
  noteKey,
  NOTE_DESCRIPTION_MAX_LENGTH,
  SECTION_FILE,
  slugFromTitle,
  validateNoteInput,
  validateSectionInput,
  type Note,
  type NoteError,
  type NoteResult,
  type NoteSummary,
  type SectionResult,
  type SectionSummary,
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
  section: string | null;
  sort_order: number | null;
  description: string | null;
}

class WikiError extends Error {
  constructor(readonly code: NoteError) {
    super(code);
  }
}

const EXTENSION = '.md';
const TEMP_SUFFIX = '.tmp';

function toSummary(row: NoteRow): NoteSummary {
  return {
    slug: row.slug,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.section !== null && { section: row.section }),
    ...(row.sort_order !== null && { order: row.sort_order }),
    ...(row.description !== null && { description: row.description }),
  };
}

/** Folder of a section (or `wiki/` itself for null); never anywhere but directly under `wiki/`. */
function sectionDir(wiki: Wiki, section: string | null): string {
  const root = path.resolve(wiki.dir);
  if (section === null) return root;
  const dir = path.resolve(root, section);
  // Defense in depth: names are validated, but a section must never leave wiki/.
  if (!isValidSection(section) || path.dirname(dir) !== root) throw new WikiError('invalid');
  return dir;
}

function filePath(wiki: Wiki, slug: string, section: string | null = null): string {
  const dir = sectionDir(wiki, section);
  const resolved = path.resolve(dir, slug + EXTENSION);
  // Defense in depth: slugs are validated, but a note must never leave its folder.
  if (path.dirname(resolved) !== dir) throw new WikiError('invalid');
  return resolved;
}

/** True if `file` exists and, once symlinks are resolved, is still inside `wiki/`. */
function isInsideWiki(wiki: Wiki, file: string): boolean {
  try {
    const root = fs.realpathSync(wiki.dir);
    const real = fs.realpathSync(file);
    return real.startsWith(root + path.sep);
  } catch {
    return false;
  }
}

/** `_section.md` holds the title of a folder, so a note can never take that name. */
function isReservedName(slug: string): boolean {
  return slug.toLowerCase() + EXTENSION === SECTION_FILE;
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

export interface NoteMeta {
  order?: number | null;
  description?: string | null;
}

export function serializeNote(
  title: string,
  createdAt: string,
  updatedAt: string,
  content: string,
  meta: NoteMeta = {},
): string {
  const extra =
    (meta.order == null ? '' : `order: ${meta.order}\n`) +
    (meta.description == null ? '' : `description: ${JSON.stringify(meta.description)}\n`);
  return `---\ntitle: ${JSON.stringify(title)}\n${extra}created: ${createdAt}\nupdated: ${updatedAt}\n---\n\n${toLf(content)}`;
}

export interface ParsedNote {
  title: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  content: string;
  /** Absent when the frontmatter has no valid `order` / `description`. */
  order?: number;
  description?: string;
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
  const orderText = fields.get('order');
  const order = orderText !== undefined && /^-?\d{1,9}$/.test(orderText) ? Number(orderText) : null;
  const description = read('description')?.slice(0, NOTE_DESCRIPTION_MAX_LENGTH) ?? null;
  return {
    title: read('title'),
    createdAt: date('created'),
    updatedAt: date('updated'),
    content: text.slice(match[0].length).replace(/^\r?\n/, ''),
    ...(order !== null && { order }),
    ...(description !== null && { description }),
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
  if (isReservedName(slug)) return true;
  const clash = wiki.db
    .prepare('SELECT 1 FROM notes WHERE id != ? AND (title_key = ? OR slug = ? COLLATE NOCASE)')
    .get(selfId, key, slug);
  return clash !== undefined;
}

function failure(error: unknown): { ok: false; error: NoteError } {
  if (error instanceof WikiError) return { ok: false, error: error.code };
  return { ok: false, error: 'io' };
}

/**
 * Notes sorted by title. With `section`, only the notes of that folder; a name that is not a
 * valid folder name lists nothing.
 */
export function listNotes(wiki: Wiki, section?: unknown): NoteSummary[] {
  if (section === undefined) {
    const rows = wiki.db.prepare('SELECT * FROM notes ORDER BY title_key').all() as NoteRow[];
    return rows.map(toSummary);
  }
  if (!isValidSection(section)) return [];
  const rows = wiki.db
    .prepare('SELECT * FROM notes WHERE section = ? ORDER BY title_key')
    .all(section) as NoteRow[];
  return rows.map(toSummary);
}

/**
 * Folders that hold at least one note or a `_section.md`, with the title and order from it.
 * A section created from the sidebar shows here before it has pages.
 */
export function listSections(wiki: Wiki): SectionSummary[] {
  const rows = wiki.db
    .prepare(
      `SELECT name, title, sort_order FROM note_sections
       UNION
       SELECT DISTINCT section, section, NULL FROM notes
       WHERE section IS NOT NULL AND section NOT IN (SELECT name FROM note_sections)
       ORDER BY title COLLATE NOCASE`,
    )
    .all() as { name: string; title: string; sort_order: number | null }[];
  return rows.map((r) => ({
    name: r.name,
    title: r.title,
    ...(r.sort_order !== null && { order: r.sort_order }),
  }));
}

export function getNote(wiki: Wiki, slug: unknown): NoteResult {
  if (!isValidSlug(slug)) return { ok: false, error: 'invalid' };
  const row = findBySlug(wiki.db, slug);
  if (!row) return { ok: false, error: 'not_found' };
  let text: string;
  try {
    const file = filePath(wiki, row.slug, row.section);
    if (!isInsideWiki(wiki, file)) return { ok: false, error: 'not_found' };
    text = fs.readFileSync(file, 'utf8');
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
  const section = checked.section ?? null;

  try {
    const dir = sectionDir(wiki, section);
    wiki.db.transaction(() => {
      if (conflicts(wiki, 0, slug, key)) throw new WikiError('duplicate');
      const info = wiki.db
        .prepare(
          'INSERT INTO notes (slug, title, title_key, created_at, updated_at, section) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(slug, checked.title, key, stamp, stamp, section);
      indexLinks(wiki.db, Number(info.lastInsertRowid), toLf(checked.content));
      const target = filePath(wiki, slug, section);
      fs.mkdirSync(dir, { recursive: true });
      if (section !== null && !isInsideWiki(wiki, dir)) throw new WikiError('invalid');
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
      const target = filePath(wiki, nextSlug, current.section);
      sameFile = isSameFile(filePath(wiki, current.slug, current.section), target);
      if (nextSlug !== current.slug && !sameFile && fs.existsSync(target)) {
        throw new WikiError('duplicate');
      }
      wiki.db
        .prepare('UPDATE notes SET slug = ?, title = ?, title_key = ?, updated_at = ? WHERE id = ?')
        .run(nextSlug, checked.title, key, stamp, current.id);
      indexLinks(wiki.db, current.id, checked.content);
      writeFileAtomic(
        target,
        serializeNote(checked.title, current.created_at, stamp, checked.content, {
          order: current.sort_order,
          description: current.description,
        }),
      );
      written = true;
      if (nextSlug !== current.slug && !sameFile) {
        fs.rmSync(filePath(wiki, current.slug, current.section));
      }
    })();
  } catch (error) {
    if (written && nextSlug !== current.slug && !sameFile)
      fs.rmSync(filePath(wiki, nextSlug, current.section), { force: true });
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
    fs.rmSync(filePath(wiki, row.slug, row.section), { force: true });
    if (row.section !== null) forgetEmptySection(wiki, row.section);
  })();
  return true;
}

/** A section left without pages stays only if it has its own `_section.md` (as after a restart). */
function forgetEmptySection(wiki: Wiki, section: string): void {
  const used = wiki.db.prepare('SELECT 1 FROM notes WHERE section = ?').get(section);
  if (used !== undefined || hasSectionFile(wiki, section)) return;
  wiki.db.prepare('DELETE FROM note_sections WHERE name = ?').run(section);
}

function hasSectionFile(wiki: Wiki, section: string): boolean {
  return isInsideWiki(wiki, path.join(sectionDir(wiki, section), SECTION_FILE));
}

/** True if a section, or any entry of `wiki/`, already has this name (ignoring case). */
function sectionTaken(wiki: Wiki, name: string): boolean {
  const key = name.normalize('NFC').toLowerCase();
  const indexed = wiki.db
    .prepare(
      `SELECT name FROM note_sections UNION SELECT DISTINCT section FROM notes WHERE section IS NOT NULL`,
    )
    .all() as { name: string }[];
  const onDisk = fs.existsSync(wiki.dir) ? fs.readdirSync(wiki.dir) : [];
  return [...indexed.map((r) => r.name), ...onDisk].some(
    (n) => n.normalize('NFC').toLowerCase() === key,
  );
}

/**
 * Creates a section from the sidebar: a folder directly under `wiki/` with its `_section.md`
 * (title = the name given). Folder, file and index change together: on any failure the folder
 * is removed again, so nothing is left half made (RNF-08).
 */
export function createSection(wiki: Wiki, input: unknown, now: Date = new Date()): SectionResult {
  const checked = validateSectionInput(input);
  if (!checked.ok) return checked;
  const name = checked.title;
  const stamp = now.toISOString();
  let created: string | null = null;

  try {
    const dir = sectionDir(wiki, name);
    wiki.db.transaction(() => {
      if (sectionTaken(wiki, name)) throw new WikiError('duplicate');
      wiki.db
        .prepare('INSERT INTO note_sections (name, title, sort_order) VALUES (?, ?, NULL)')
        .run(name, name);
      fs.mkdirSync(wiki.dir, { recursive: true });
      fs.mkdirSync(dir);
      created = dir;
      if (!isInsideWiki(wiki, dir)) throw new WikiError('invalid');
      writeFileAtomic(path.join(dir, SECTION_FILE), serializeNote(name, stamp, stamp, ''));
    })();
  } catch (error) {
    if (created !== null) fs.rmSync(created, { recursive: true, force: true });
    if (error instanceof WikiError)
      return { ok: false, error: error.code === 'duplicate' ? 'duplicate' : 'invalid' };
    return { ok: false, error: 'io' };
  }
  return { ok: true, section: { name, title: name } };
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

interface FoundFile {
  slug: string;
  section: string | null;
}

/** Page files of one folder of `wiki/`; symlinks and `_section.md` are not pages. */
function pageFiles(dir: string, section: string | null): FoundFile[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(
      (e) =>
        e.isFile() &&
        e.name.toLowerCase().endsWith(EXTENSION) &&
        e.name.toLowerCase() !== SECTION_FILE,
    )
    .map((e) => e.name.slice(0, -EXTENSION.length))
    .filter((slug) => isValidSlug(slug))
    .sort()
    .map((slug) => ({ slug, section }));
}

/**
 * Rebuilds the whole index from the files in `wiki/` (ADR-001): run at startup, so a
 * deleted `datos.db` loses nothing. Notes in the root have no section; each folder directly under
 * `wiki/` is a section (deeper folders and symlinks are ignored). A file that cannot be read,
 * or whose title or name clashes with an earlier one, is left out of the index (and untouched on disk).
 */
export function rebuildIndex(wiki: Wiki): number {
  fs.mkdirSync(wiki.dir, { recursive: true });
  removeOrphanTempFiles(wiki.dir);
  const folders = fs
    .readdirSync(wiki.dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && isValidSection(e.name))
    .map((e) => e.name)
    .sort();
  const found: FoundFile[] = pageFiles(wiki.dir, null);
  const sections: SectionSummary[] = [];
  for (const name of folders) {
    const dir = sectionDir(wiki, name);
    removeOrphanTempFiles(dir);
    const files = pageFiles(dir, name);
    const sectionFile = path.join(dir, SECTION_FILE);
    const hasFile = isInsideWiki(wiki, sectionFile);
    // An empty folder is not a section, unless it has its _section.md (created from the sidebar).
    if (files.length === 0 && !hasFile) continue;
    found.push(...files);
    let meta: ParsedNote | null = null;
    try {
      if (hasFile) meta = parseNote(fs.readFileSync(sectionFile, 'utf8'));
    } catch {
      // a section without a readable _section.md is titled with its folder name
    }
    sections.push({
      name,
      title: meta?.title ?? name,
      ...(meta?.order !== undefined && { order: meta.order }),
    });
  }

  return wiki.db.transaction(() => {
    wiki.db.prepare('DELETE FROM notes').run();
    wiki.db.prepare('DELETE FROM note_sections').run();
    const insertSection = wiki.db.prepare(
      'INSERT INTO note_sections (name, title, sort_order) VALUES (?, ?, ?)',
    );
    for (const s of sections) insertSection.run(s.name, s.title, s.order ?? null);
    const insert = wiki.db.prepare(
      'INSERT INTO notes (slug, title, title_key, created_at, updated_at, section, sort_order, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const slugs = new Set<string>();
    const keys = new Set<string>();
    let count = 0;
    for (const { slug, section } of found) {
      const file = filePath(wiki, slug, section);
      let text: string;
      try {
        if (!isInsideWiki(wiki, file)) continue;
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
        section,
        parsed.order ?? null,
        parsed.description ?? null,
      );
      indexLinks(wiki.db, Number(info.lastInsertRowid), parsed.content);
      count++;
    }
    return count;
  })();
}
