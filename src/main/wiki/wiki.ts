import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { ASSETS_SUFFIX, rewriteAssetLinks } from '../../shared/attachments';
import {
  extractLinks,
  isValidNotePath,
  isValidSection,
  isValidSectionPath,
  isValidSlug,
  joinSection,
  linkKeysOf,
  linkTargets,
  MAX_SECTION_DEPTH,
  noteKey,
  NOTE_DESCRIPTION_MAX_LENGTH,
  SECTION_FILE,
  sectionChain,
  slugBaseName,
  slugFromTitle,
  validateNoteInput,
  validateSectionInput,
  type Note,
  type NoteError,
  type NoteResult,
  type NoteSummary,
  type SectionResult,
  type SectionSummary,
  type SkippedFile,
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
  title_key: string;
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

/**
 * Folder of a section path (or `wiki/` itself for null). Every part must be a valid folder name and the
 * result must stay inside `wiki/`, whatever the caller sent.
 */
function sectionDir(wiki: Wiki, section: string | null): string {
  const root = path.resolve(wiki.dir);
  if (section === null) return root;
  if (!isValidSectionPath(section)) throw new WikiError('invalid');
  const dir = path.resolve(root, ...section.split('/'));
  // Defense in depth: names are validated, but a section must never leave wiki/.
  if (!dir.startsWith(root + path.sep)) throw new WikiError('invalid');
  return dir;
}

/** File of the note whose path inside `wiki/` (without `.md`) is `slug`. */
function filePath(wiki: Wiki, slug: string): string {
  if (!isValidNotePath(slug)) throw new WikiError('invalid');
  const at = slug.lastIndexOf('/');
  const dir = sectionDir(wiki, at === -1 ? null : slug.slice(0, at));
  const resolved = path.resolve(dir, slugBaseName(slug) + EXTENSION);
  // Defense in depth: slugs are validated, but a note must never leave its folder.
  if (path.dirname(resolved) !== dir) throw new WikiError('invalid');
  return resolved;
}

/** True if `file` exists and, once symlinks are resolved, is still inside `wiki/`. */
export function isInsideWiki(wiki: Wiki, file: string): boolean {
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

/**
 * The file of a note by slug, for work on its attachments. `invalid` for a bad slug or a note that is a
 * symbolic link; `not_found` when the note or its file is gone.
 */
export function locateNote(wiki: Wiki, slug: unknown): { file: string } | 'invalid' | 'not_found' {
  if (!isValidNotePath(slug)) return 'invalid';
  const row = findBySlug(wiki.db, slug);
  if (!row) return 'not_found';
  try {
    const file = filePath(wiki, row.slug);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) return 'invalid';
    return stat.isFile() && isInsideWiki(wiki, file) ? { file } : 'not_found';
  } catch (error) {
    return error instanceof WikiError ? 'invalid' : 'not_found';
  }
}

/** Folder of the attachments of the note whose file is `noteFile`. */
export function assetsDirOf(noteFile: string): string {
  return noteFile.slice(0, -EXTENSION.length) + ASSETS_SUFFIX;
}

/** Number of files in a note's assets folder; 0 if there is none. Symbolic links do not count. */
function countAttachments(noteFile: string): number {
  try {
    const dir = assetsDirOf(noteFile);
    if (fs.lstatSync(dir).isSymbolicLink()) return 0;
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).length;
  } catch {
    return 0;
  }
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

/** Hash of a file's text, to tell whether it changed on disk since the app read it. */
export function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
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

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const KEY_LINE = /^([^\s#:'"-][^:]*?)[ \t]*:(?:[ \t]|$)/;

/**
 * True if the frontmatter lines can be edited line by line: every top-level line is a comment, a blank,
 * a continuation or a `key: value` with a new key and no quote left open. Anything else (broken YAML,
 * repeated keys, unclosed quotes) is left exactly as the user wrote it.
 */
function isEditableFrontmatter(lines: string[]): boolean {
  const seen = new Set<string>();
  for (const line of lines.map((l) => l.replace(/\r$/, ''))) {
    if (line.trim() === '' || line.trimStart().startsWith('#') || /^[ \t-]/.test(line)) continue;
    const m = KEY_LINE.exec(line);
    if (!m || seen.has(m[1])) return false;
    seen.add(m[1]);
    const value = line.slice(m[0].length).trim();
    if (/^"/.test(value) && !/^"(?:[^"\\]|\\.)*"(?:\s+#.*)?$/.test(value)) return false;
    if (/^'/.test(value) && !/^'(?:[^']|'')*'(?:\s+#.*)?$/.test(value)) return false;
  }
  return true;
}

export interface FrontmatterEdit {
  title?: string;
  created?: string;
  updated: string;
  order?: number;
  description?: string;
}

/**
 * Saves a note over its existing file text keeping everything the app does not own: other keys,
 * comments, blank lines, key order, BOM. Only the `title`, `updated`,
 * `order` and `description` lines in `edit` are replaced (or added when missing). A frontmatter the app
 * cannot read is kept as is. The body is written as given, with LF line endings.
 */
export function rewriteNote(
  existing: string,
  edit: FrontmatterEdit & { title: string; created: string },
  content: string,
): string {
  const bom = existing.startsWith('\uFEFF') ? '\uFEFF' : '';
  const text = toLf(existing.slice(bom.length)); // notes are always saved with LF (RNF-12)
  content = toLf(content);
  const match = FRONTMATTER.exec(text);
  if (!match) {
    return bom + serializeNote(edit.title, edit.created, edit.updated, '') + content;
  }
  const eol = '\n';
  const lines = match[1].split('\n');
  const rest = text.slice(match[0].length);
  const closing = match[0].slice(match[0].lastIndexOf('---'));
  const body = /^\r?\n/.test(rest) || /^\r?\n/.test(content) ? eol + content : content;
  if (!isEditableFrontmatter(lines)) return bom + text.slice(0, match[0].length) + body;

  const values: [string, string | undefined][] = [
    ['title', edit.title === undefined ? undefined : JSON.stringify(edit.title)],
    ['order', edit.order === undefined ? undefined : String(edit.order)],
    ['description', edit.description === undefined ? undefined : JSON.stringify(edit.description)],
    ['updated', edit.updated],
  ];
  for (const [key, value] of values) {
    if (value === undefined) continue;
    const line = `${key}: ${value}`;
    const at = lines.findIndex((l) => KEY_LINE.exec(l)?.[1] === key);
    if (at === -1) {
      if (key === 'title') lines.unshift(line);
      else lines.push(line);
      continue;
    }
    let end = at + 1;
    while (end < lines.length && /^[ \t]+\S/.test(lines[end])) end++;
    lines.splice(at, end - at, line);
  }
  return `${bom}---${eol}${lines.join('\n')}${eol}${closing}${body}`;
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

/** Keeps the text of a note searchable (RF-10); the title is kept in step by triggers. */
function indexBody(db: Database.Database, noteId: number, content: string): void {
  db.prepare('UPDATE note_search SET body = ? WHERE rowid = ?').run(content, noteId);
}

function findBySlug(db: Database.Database, slug: string): NoteRow | undefined {
  return db.prepare('SELECT * FROM notes WHERE slug = ?').get(slug) as NoteRow | undefined;
}

/** True if another note (not `selfId`) of the same folder already uses this title or file name. */
function conflicts(
  wiki: Wiki,
  selfId: number,
  section: string | null,
  slug: string,
  key: string,
): boolean {
  if (isReservedName(slugBaseName(slug))) return true;
  const clash = wiki.db
    .prepare(
      `SELECT 1 FROM notes WHERE id != ?
       AND (COALESCE(section, '') = ? AND title_key = ? OR slug = ? COLLATE NOCASE)`,
    )
    .get(selfId, section ?? '', key, slug);
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
  if (!isValidSectionPath(section)) return [];
  const rows = wiki.db
    .prepare('SELECT * FROM notes WHERE section = ? ORDER BY title_key')
    .all(section) as NoteRow[];
  return rows.map(toSummary);
}

/**
 * Folders that hold a note, a `_section.md` or a folder that does, at any depth, with the title and
 * order from it. A section created from the sidebar shows here before it has pages.
 */
export function listSections(wiki: Wiki): SectionSummary[] {
  const rows = wiki.db.prepare('SELECT name, title, sort_order FROM note_sections').all() as {
    name: string;
    title: string;
    sort_order: number | null;
  }[];
  const known = new Map<string, SectionSummary>(
    rows.map((r) => [
      r.name,
      { name: r.name, title: r.title, ...(r.sort_order !== null && { order: r.sort_order }) },
    ]),
  );
  const used = wiki.db
    .prepare('SELECT DISTINCT section FROM notes WHERE section IS NOT NULL')
    .all() as { section: string }[];
  // A folder with notes is a section even when the index has no row for it, and so are the folders above.
  for (const { section } of used) {
    for (const folder of sectionChain(section)) {
      if (!known.has(folder)) known.set(folder, { name: folder, title: slugBaseName(folder) });
    }
  }
  return [...known.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getNote(wiki: Wiki, slug: unknown): NoteResult {
  if (!isValidNotePath(slug)) return { ok: false, error: 'invalid' };
  const row = findBySlug(wiki.db, slug);
  if (!row) return { ok: false, error: 'not_found' };
  let text: string;
  try {
    const file = filePath(wiki, row.slug);
    if (!isInsideWiki(wiki, file)) return { ok: false, error: 'not_found' };
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { ok: false, error: 'not_found' };
  }
  const targets = linkTargets(
    (wiki.db.prepare('SELECT * FROM notes').all() as NoteRow[]).map(toSummary),
  );
  const links = (
    wiki.db
      .prepare('SELECT label, key FROM note_links WHERE note_id = ? ORDER BY rowid')
      .all(row.id) as { label: string; key: string }[]
  ).map((l) => ({ ...l, slug: targets.get(l.key) ?? null }));
  // Another note links here when its link resolves to this note, by title or by path.
  const own = linkKeysOf(toSummary(row));
  const backlinks = (
    wiki.db
      .prepare(
        `SELECT n.*, l.key AS link_key FROM note_links l JOIN notes n ON n.id = l.note_id
         WHERE l.key IN (${own.map(() => '?').join(', ')}) AND n.id != ?
         ORDER BY n.title_key, n.slug`,
      )
      .all(...own, row.id) as (NoteRow & { link_key: string })[]
  ).filter((n) => targets.get(n.link_key) === row.slug);
  const attachments = countAttachments(filePath(wiki, row.slug));
  const note: Note = {
    ...toSummary(row),
    ...(attachments > 0 && { attachments }),
    content: parseNote(text).content,
    hash: hashText(text),
    links,
    backlinks: [...new Map(backlinks.map((n) => [n.id, n])).values()].map(toSummary),
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
  const section = checked.section ?? null;
  const slug = joinSection(section, slugFromTitle(checked.title));
  const key = noteKey(checked.title);
  const stamp = now.toISOString();

  try {
    const dir = sectionDir(wiki, section);
    wiki.db.transaction(() => {
      if (conflicts(wiki, 0, section, slug, key)) throw new WikiError('duplicate');
      const info = wiki.db
        .prepare(
          'INSERT INTO notes (slug, title, title_key, created_at, updated_at, section) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(slug, checked.title, key, stamp, stamp, section);
      indexLinks(wiki.db, Number(info.lastInsertRowid), toLf(checked.content));
      indexBody(wiki.db, Number(info.lastInsertRowid), toLf(checked.content));
      const target = filePath(wiki, slug);
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

function readIfExists(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
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
  if (!isValidNotePath(slug)) return { ok: false, error: 'invalid' };
  const checked = validateNoteInput(input);
  if (!checked.ok) return checked;
  const { expectedHash, overwrite } = input as { expectedHash?: unknown; overwrite?: unknown };
  const guarded = typeof expectedHash === 'string' && overwrite !== true;
  const current = findBySlug(wiki.db, slug);
  if (!current) {
    // The file was deleted or renamed outside the app: never recreate it in silence.
    if (typeof expectedHash !== 'string') return { ok: false, error: 'not_found' };
    if (guarded) return { ok: false, error: 'conflict' };
    return createNote(wiki, { title: checked.title, content: checked.content }, now);
  }
  if (guarded) {
    const onDisk = readIfExists(filePath(wiki, current.slug));
    if (onDisk === null || hashText(onDisk) !== expectedHash)
      return { ok: false, error: 'conflict' };
  }

  const key = noteKey(checked.title);
  const renamed = checked.title !== current.title;
  const nextSlug = renamed
    ? joinSection(current.section, slugFromTitle(checked.title))
    : current.slug;
  const stamp = now.toISOString();
  // Renaming the note moves its assets folder, so the links in the body follow it.
  const content = renamed
    ? rewriteAssetLinks(checked.content, slugBaseName(current.slug), slugBaseName(nextSlug))
    : checked.content;
  let written = false;
  let sameFile = false;
  const moved: { from?: string; to?: string } = {};

  try {
    wiki.db.transaction(() => {
      if (conflicts(wiki, current.id, current.section, nextSlug, key))
        throw new WikiError('duplicate');
      const target = filePath(wiki, nextSlug);
      sameFile = isSameFile(filePath(wiki, current.slug), target);
      if (nextSlug !== current.slug && !sameFile && fs.existsSync(target)) {
        throw new WikiError('duplicate');
      }
      wiki.db
        .prepare('UPDATE notes SET slug = ?, title = ?, title_key = ?, updated_at = ? WHERE id = ?')
        .run(nextSlug, checked.title, key, stamp, current.id);
      indexLinks(wiki.db, current.id, content);
      indexBody(wiki.db, current.id, toLf(content));
      const existing = readIfExists(filePath(wiki, current.slug));
      writeFileAtomic(
        target,
        existing === null
          ? serializeNote(checked.title, current.created_at, stamp, content, {
              order: current.sort_order,
              description: current.description,
            })
          : rewriteNote(
              existing,
              { title: checked.title, created: current.created_at, updated: stamp },
              content,
            ),
      );
      written = true;
      if (nextSlug !== current.slug) {
        Object.assign(moved, moveAssets(filePath(wiki, current.slug), target));
      }
      if (nextSlug !== current.slug && !sameFile) {
        fs.rmSync(filePath(wiki, current.slug));
      }
    })();
  } catch (error) {
    if (moved.from && moved.to) fs.renameSync(moved.to, moved.from);
    if (written && nextSlug !== current.slug && !sameFile)
      fs.rmSync(filePath(wiki, nextSlug), { force: true });
    return failure(error);
  }
  return getNote(wiki, nextSlug);
}

/**
 * Moves `<old>.assets` to `<new>.assets` when the note has one. Returns the move, to undo it, or null if
 * there was nothing to move. A folder already in the new place is a `duplicate`.
 */
function moveAssets(oldFile: string, newFile: string): { from: string; to: string } | null {
  const from = assetsDirOf(oldFile);
  const to = assetsDirOf(newFile);
  try {
    if (!fs.lstatSync(from).isDirectory()) return null;
  } catch {
    return null;
  }
  if (fs.existsSync(to) && !isSameFile(from, to)) throw new WikiError('duplicate');
  fs.renameSync(from, to);
  return { from, to };
}

/**
 * True if `section` is a real folder under `wiki/` (every level a directory, no symbolic link on the way).
 */
function isRealSection(wiki: Wiki, section: string): boolean {
  try {
    for (const folder of sectionChain(section)) {
      const stat = fs.lstatSync(sectionDir(wiki, folder));
      if (!stat.isDirectory()) return false;
    }
    return isInsideWiki(wiki, sectionDir(wiki, section));
  } catch {
    return false;
  }
}

/**
 * Moves a note, with its `.assets` folder, to another section (`null` = the root of `wiki/`). The file is
 * renamed, never rewritten, so frontmatter and body stay byte for byte as they were. A name already taken
 * in the target moves nothing; the same section is a no-op. Index and disk change together: on any
 * failure the files go back where they were (RNF-08).
 */
export function moveNote(wiki: Wiki, slug: unknown, target: unknown): NoteResult {
  if (!isValidNotePath(slug)) return { ok: false, error: 'invalid' };
  if (target !== null && !isValidSectionPath(target)) return { ok: false, error: 'invalid' };
  const row = findBySlug(wiki.db, slug);
  if (!row) return { ok: false, error: 'not_found' };
  if (target !== null && !isRealSection(wiki, target)) return { ok: false, error: 'invalid' };
  if (target === row.section) return getNote(wiki, slug);

  const located = locateNote(wiki, slug);
  if (typeof located === 'string') return { ok: false, error: located };
  const nextSlug = joinSection(target, slugBaseName(slug));
  let movedFile: { from: string; to: string } | null = null;
  let movedAssets: { from: string; to: string } | null = null;

  try {
    const to = filePath(wiki, nextSlug);
    wiki.db.transaction(() => {
      if (conflicts(wiki, row.id, target, nextSlug, row.title_key)) {
        throw new WikiError('duplicate');
      }
      // Nothing is replaced: a file or an assets folder already there (even unindexed) stops the move.
      if (fs.existsSync(to) || fs.existsSync(assetsDirOf(to))) throw new WikiError('duplicate');
      wiki.db
        .prepare('UPDATE notes SET slug = ?, section = ? WHERE id = ?')
        .run(nextSlug, target, row.id);
      fs.renameSync(located.file, to);
      movedFile = { from: located.file, to };
      movedAssets = moveAssets(located.file, to);
      if (row.section !== null) forgetEmptySection(wiki, row.section);
    })();
  } catch (error) {
    const assets = movedAssets as { from: string; to: string } | null;
    const file = movedFile as { from: string; to: string } | null;
    if (assets) fs.renameSync(assets.to, assets.from);
    if (file) fs.renameSync(file.to, file.from);
    return failure(error);
  }
  return getNote(wiki, nextSlug);
}

/**
 * Deletes file and index entry together; notes that linked to it keep a pending link. The assets folder
 * goes too only when `deleteAttachments` is true.
 */
export function deleteNote(wiki: Wiki, slug: unknown, deleteAttachments: unknown = false): boolean {
  if (!isValidNotePath(slug)) return false;
  if (typeof deleteAttachments !== 'boolean') return false;
  const row = findBySlug(wiki.db, slug);
  if (!row) return false;
  wiki.db.transaction(() => {
    wiki.db.prepare('DELETE FROM notes WHERE id = ?').run(row.id);
    const file = filePath(wiki, row.slug);
    fs.rmSync(file, { force: true });
    // A symbolic link is unlinked, never followed: what it points at is not the note's own.
    if (deleteAttachments) fs.rmSync(assetsDirOf(file), { recursive: true, force: true });
    if (row.section !== null) forgetEmptySection(wiki, row.section);
  })();
  return true;
}

/**
 * A section left without pages stays only if it has its own `_section.md` (as after a restart) or a
 * section inside it that stays. Looks at the folder and then at the ones above it.
 */
function forgetEmptySection(wiki: Wiki, section: string): void {
  for (const folder of sectionChain(section).reverse()) {
    const used = wiki.db
      .prepare('SELECT 1 FROM notes WHERE section = ? OR substr(section, 1, ?) = ?')
      .get(folder, folder.length + 1, `${folder}/`);
    const inside = wiki.db
      .prepare('SELECT 1 FROM note_sections WHERE substr(name, 1, ?) = ?')
      .get(folder.length + 1, `${folder}/`);
    if (used !== undefined || inside !== undefined || hasSectionFile(wiki, folder)) return;
    wiki.db.prepare('DELETE FROM note_sections WHERE name = ?').run(folder);
  }
}

function hasSectionFile(wiki: Wiki, section: string): boolean {
  return isInsideWiki(wiki, path.join(sectionDir(wiki, section), SECTION_FILE));
}

/** True if a section, or any entry of its parent folder, already has this name (ignoring case). */
function sectionTaken(wiki: Wiki, parent: string | null, name: string): boolean {
  const key = joinSection(parent, name).normalize('NFC').toLowerCase();
  const indexed = wiki.db
    .prepare(
      `SELECT name FROM note_sections UNION SELECT DISTINCT section FROM notes WHERE section IS NOT NULL`,
    )
    .all() as { name: string }[];
  const parentDir = sectionDir(wiki, parent);
  const onDisk = (fs.existsSync(parentDir) ? fs.readdirSync(parentDir) : []).map((n) =>
    joinSection(parent, n),
  );
  const names = [...indexed.flatMap((r) => sectionChain(r.name)), ...onDisk];
  return names.some((n) => n.normalize('NFC').toLowerCase() === key);
}

/**
 * Creates a section from the sidebar: a folder under `wiki/` (or inside `parent`) with its `_section.md`
 * (title = the name given). Only the new folder is made, so the parent must exist and the depth limit
 * holds. Folder, file and index change together: on any failure the folder is removed again, so
 * nothing is left half made (RNF-08).
 */
export function createSection(wiki: Wiki, input: unknown, now: Date = new Date()): SectionResult {
  const checked = validateSectionInput(input);
  if (!checked.ok) return checked;
  const name = checked.title;
  const parent = checked.parent ?? null;
  const section = joinSection(parent, name);
  const stamp = now.toISOString();
  let created: string | null = null;

  try {
    const dir = sectionDir(wiki, section);
    wiki.db.transaction(() => {
      // The parent is an existing folder inside wiki/ (never a symbolic link out of it).
      if (parent !== null) {
        const parentDir = sectionDir(wiki, parent);
        if (!fs.statSync(parentDir, { throwIfNoEntry: false })?.isDirectory()) {
          throw new WikiError('invalid');
        }
        if (!isInsideWiki(wiki, parentDir)) throw new WikiError('invalid');
      }
      if (sectionTaken(wiki, parent, name)) throw new WikiError('duplicate');
      wiki.db
        .prepare('INSERT INTO note_sections (name, title, sort_order) VALUES (?, ?, NULL)')
        .run(section, name);
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
  return { ok: true, section: { name: section, title: name } };
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
  /** Path of the file inside `wiki/` without `.md`. */
  slug: string;
  section: string | null;
}

/** Page files of one folder of `wiki/`; symlinks and `_section.md` are not pages. */
function pageFiles(dir: string, section: string | null): { found: FoundFile[]; invalid: string[] } {
  const names = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(
      (e) =>
        e.isFile() &&
        e.name.toLowerCase().endsWith(EXTENSION) &&
        e.name.toLowerCase() !== SECTION_FILE &&
        !e.name.startsWith('.'),
    )
    .map((e) => e.name.slice(0, -EXTENSION.length))
    .sort();
  return {
    found: names
      .filter((name) => isValidSlug(name))
      .map((name) => ({ slug: joinSection(section, name), section })),
    invalid: names.filter((name) => !isValidSlug(name)).map((name) => relative(section, name)),
  };
}

function relative(section: string | null, slug: string): string {
  return joinSection(section, slug) + EXTENSION;
}

export interface RebuildReport {
  /** Notes indexed. */
  count: number;
  /** Files left out, with the reason. */
  skipped: SkippedFile[];
}

/**
 * Rebuilds the whole index from the files in `wiki/` (ADR-001): run at startup, so a
 * deleted `datos.db` loses nothing. Notes in the root have no section; every folder below `wiki/`, up
 * to `MAX_SECTION_DEPTH` levels, is a section (deeper folders are reported, symlinks are ignored).
 * A file that cannot be read, or whose title or name clashes with an earlier one in the same folder, is
 * left out of the index (and untouched on disk).
 */
export function rebuildIndex(wiki: Wiki): number {
  return rebuildIndexReport(wiki).count;
}

/** Same as `rebuildIndex`, and also says which files were left out and why. */
export function rebuildIndexReport(wiki: Wiki): RebuildReport {
  const skipped: SkippedFile[] = [];
  fs.mkdirSync(wiki.dir, { recursive: true });
  removeOrphanTempFiles(wiki.dir);
  const root = pageFiles(wiki.dir, null);
  const found: FoundFile[] = root.found;
  for (const file of root.invalid) skipped.push({ file, reason: 'invalid_name' });
  const sections: SectionSummary[] = [];

  /** Walks one folder; true if it (or a folder inside) is a section. */
  const visit = (section: string): boolean => {
    const dir = sectionDir(wiki, section);
    removeOrphanTempFiles(dir);
    const { found: files, invalid } = pageFiles(dir, section);
    for (const file of invalid) skipped.push({ file, reason: 'invalid_name' });
    const sectionFile = path.join(dir, SECTION_FILE);
    const hasFile = isInsideWiki(wiki, sectionFile);
    // Only real folders count: a symbolic link is neither followed nor listed.
    const children = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && isValidSection(e.name))
      .map((e) => e.name)
      .sort();
    const mark = sections.length;
    sections.push({ name: section, title: slugBaseName(section) }); // placeholder, filled below
    let inside = false;
    for (const child of children) {
      const childPath = joinSection(section, child);
      if (sectionChain(childPath).length > MAX_SECTION_DEPTH) {
        skipped.push({ file: childPath, reason: 'too_deep' });
      } else if (visit(childPath)) inside = true;
    }
    // An empty folder is not a section, unless it has its _section.md (created from the sidebar).
    if (files.length === 0 && !hasFile && !inside) {
      sections.splice(mark, 1);
      return false;
    }
    found.push(...files);
    let meta: ParsedNote | null = null;
    try {
      if (hasFile) meta = parseNote(fs.readFileSync(sectionFile, 'utf8'));
    } catch {
      // a section without a readable _section.md is titled with its folder name
    }
    sections[mark] = {
      name: section,
      title: meta?.title ?? slugBaseName(section),
      ...(meta?.order !== undefined && { order: meta.order }),
    };
    return true;
  };
  for (const entry of fs
    .readdirSync(wiki.dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && isValidSection(e.name))
    .map((e) => e.name)
    .sort()) {
    visit(entry);
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
      const file = filePath(wiki, slug);
      let text: string;
      try {
        if (!isInsideWiki(wiki, file)) throw new Error('outside wiki');
        text = fs.readFileSync(file, 'utf8');
      } catch {
        // an unreadable file must not abort the whole rebuild
        skipped.push({ file: slug + EXTENSION, reason: 'unreadable' });
        continue;
      }
      const parsed = parseNote(text);
      const title = parsed.title ?? slugBaseName(slug);
      // A title is unique inside its folder; the same title in two folders is two notes.
      const key = noteKey(title);
      const folderKey = `${section ?? ''}\0${key}`;
      const slugKey = slug.normalize('NFC').toLowerCase();
      if (slugs.has(slugKey) || keys.has(folderKey)) {
        skipped.push({ file: slug + EXTENSION, reason: 'duplicate' });
        continue;
      }
      slugs.add(slugKey);
      keys.add(folderKey);
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
      indexBody(wiki.db, Number(info.lastInsertRowid), parsed.content);
      count++;
    }
    return { count, skipped };
  })();
}
