import type Database from 'better-sqlite3';
import {
  validateSnippetInput,
  type Snippet,
  type SnippetResult,
  type SnippetType,
} from '../../shared/snippets';

interface SnippetRow {
  id: number;
  title: string;
  type: SnippetType;
  content: string;
  created_at: string;
  updated_at: string;
}

const SELECT_SNIPPET = 'SELECT id, title, type, content, created_at, updated_at FROM snippets';

function toSnippet(row: SnippetRow, tags: string[]): Snippet {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    content: row.content,
    tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function tagsOf(db: Database.Database, id: number): string[] {
  const rows = db
    .prepare(
      'SELECT g.name FROM snippet_tags st JOIN tags g ON g.id = st.tag_id WHERE st.snippet_id = ? ORDER BY g.name',
    )
    .all(id) as { name: string }[];
  return rows.map((r) => r.name);
}

function getSnippet(db: Database.Database, id: number): Snippet | null {
  const row = db.prepare(`${SELECT_SNIPPET} WHERE id = ?`).get(id) as SnippetRow | undefined;
  return row ? toSnippet(row, tagsOf(db, id)) : null;
}

function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/** Replaces the tag set of a snippet. Tags are stored once and related per snippet. */
function setTags(db: Database.Database, snippetId: number, tags: string[]): void {
  db.prepare('DELETE FROM snippet_tags WHERE snippet_id = ?').run(snippetId);
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  const link = db.prepare(
    'INSERT INTO snippet_tags (snippet_id, tag_id) SELECT ?, id FROM tags WHERE name = ?',
  );
  for (const tag of tags) {
    insertTag.run(tag);
    link.run(snippetId, tag);
  }
}

/** All snippets, newest first. */
export function listSnippets(db: Database.Database): Snippet[] {
  const rows = db.prepare(`${SELECT_SNIPPET} ORDER BY id DESC`).all() as SnippetRow[];
  const links = db
    .prepare(
      'SELECT st.snippet_id AS id, g.name FROM snippet_tags st JOIN tags g ON g.id = st.tag_id ORDER BY g.name',
    )
    .all() as { id: number; name: string }[];
  const byId = new Map<number, string[]>();
  for (const { id, name } of links) byId.set(id, [...(byId.get(id) ?? []), name]);
  return rows.map((row) => toSnippet(row, byId.get(row.id) ?? []));
}

export function createSnippet(
  db: Database.Database,
  input: unknown,
  now = new Date(),
): SnippetResult {
  const checked = validateSnippetInput(input);
  if (!checked.ok) return checked;
  const stamp = now.toISOString();
  const create = db.transaction(() => {
    const info = db
      .prepare(
        'INSERT INTO snippets (title, type, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(checked.title, checked.type, checked.content, stamp, stamp);
    const id = Number(info.lastInsertRowid);
    setTags(db, id, checked.tags);
    return id;
  });
  return { ok: true, snippet: getSnippet(db, create())! };
}

/** Edits title, type, content and tags; the creation date is kept. */
export function updateSnippet(
  db: Database.Database,
  id: unknown,
  input: unknown,
  now = new Date(),
): SnippetResult {
  const checked = validateSnippetInput(input);
  if (!checked.ok) return checked;
  if (!isId(id) || !getSnippet(db, id)) return { ok: false, error: 'not_found' };
  db.transaction(() => {
    db.prepare(
      'UPDATE snippets SET title = ?, type = ?, content = ?, updated_at = ? WHERE id = ?',
    ).run(checked.title, checked.type, checked.content, now.toISOString(), id);
    setTags(db, id, checked.tags);
  })();
  return { ok: true, snippet: getSnippet(db, id)! };
}

/** Deletes the snippet and unlinks its tags in one transaction. */
export function deleteSnippet(db: Database.Database, id: unknown): boolean {
  if (!isId(id)) return false;
  return db.transaction(() => {
    db.prepare('DELETE FROM snippet_tags WHERE snippet_id = ?').run(id);
    return db.prepare('DELETE FROM snippets WHERE id = ?').run(id).changes > 0;
  })();
}
