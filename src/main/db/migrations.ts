import type Database from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  up: string;
}

/**
 * Ordered schema migrations. Never edit one that has been released: add a new
 * one instead. The applied version is stored in SQLite's `user_version`.
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: 'settings',
    up: `
      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
    `,
  },
  {
    version: 2,
    name: 'inbox_items',
    up: `
      CREATE TABLE inbox_items (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT NOT NULL,
        source     TEXT NOT NULL CHECK (source IN ('quick_capture')),
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX idx_inbox_items_created ON inbox_items (created_at DESC, id DESC);
    `,
  },
  {
    version: 3,
    name: 'projects_and_tasks',
    up: `
      CREATE TABLE projects (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE UNIQUE INDEX idx_projects_name ON projects (name COLLATE NOCASE);
      CREATE TABLE tasks (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT NOT NULL,
        status     TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'done')),
        due_date   TEXT,
        project_id INTEGER REFERENCES projects (id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX idx_tasks_project ON tasks (project_id);
    `,
  },
  {
    version: 4,
    name: 'tasks_for_today',
    up: `
      ALTER TABLE tasks ADD COLUMN for_today INTEGER NOT NULL DEFAULT 0 CHECK (for_today IN (0, 1));
    `,
  },
  {
    version: 5,
    name: 'tags',
    up: `
      CREATE TABLE tags (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      ) STRICT;
      CREATE TABLE task_tags (
        task_id INTEGER NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
        tag_id  INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
        PRIMARY KEY (task_id, tag_id)
      ) STRICT, WITHOUT ROWID;
      CREATE INDEX idx_task_tags_tag ON task_tags (tag_id);
    `,
  },
  {
    version: 6,
    name: 'tasks_in_progress',
    // SQLite cannot alter a CHECK, so the table is rebuilt. Dropping `tasks` would cascade
    // into `task_tags`, hence the tag links are parked in a temp table meanwhile.
    up: `
      CREATE TEMP TABLE task_tags_backup AS SELECT task_id, tag_id FROM task_tags;
      CREATE TABLE tasks_new (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        title        TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
        due_date     TEXT,
        project_id   INTEGER REFERENCES projects (id) ON DELETE SET NULL,
        created_at   TEXT NOT NULL,
        for_today    INTEGER NOT NULL DEFAULT 0 CHECK (for_today IN (0, 1)),
        completed_at TEXT
      ) STRICT;
      INSERT INTO tasks_new (id, title, status, due_date, project_id, created_at, for_today, completed_at)
        SELECT id, title, status, due_date, project_id, created_at, for_today,
               CASE WHEN status = 'done' THEN created_at END
        FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;
      CREATE INDEX idx_tasks_project ON tasks (project_id);
      INSERT INTO task_tags (task_id, tag_id) SELECT task_id, tag_id FROM task_tags_backup;
      DROP TABLE task_tags_backup;
    `,
  },
  {
    version: 7,
    name: 'task_series',
    // Existing tasks get a NULL series_id: they stay plain tasks. The rule is an RRULE subset.
    up: `
      CREATE TABLE task_series (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        rrule      TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
      ALTER TABLE tasks ADD COLUMN series_id INTEGER REFERENCES task_series (id) ON DELETE SET NULL;
      CREATE INDEX idx_tasks_series ON tasks (series_id);
    `,
  },
  {
    version: 8,
    name: 'wiki_notes',
    // Index only: the .md files in wiki/ are the source of truth (ADR-001). Links are stored by
    // normalized target title, so they resolve (or go pending) on read without further writes.
    up: `
      CREATE TABLE notes (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        slug       TEXT NOT NULL,
        title      TEXT NOT NULL,
        title_key  TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE UNIQUE INDEX idx_notes_slug ON notes (slug COLLATE NOCASE);
      CREATE UNIQUE INDEX idx_notes_title_key ON notes (title_key);
      CREATE TABLE note_links (
        note_id INTEGER NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
        key     TEXT NOT NULL,
        label   TEXT NOT NULL,
        PRIMARY KEY (note_id, key)
      ) STRICT;
      CREATE INDEX idx_note_links_key ON note_links (key);
    `,
  },
  {
    version: 9,
    name: 'bugs',
    // AUTOINCREMENT so the BUG-n identifier of a deleted bug is never handed out again.
    up: `
      CREATE TABLE bugs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT NOT NULL,
        symptom    TEXT NOT NULL DEFAULT '',
        impact     TEXT NOT NULL DEFAULT '',
        root_cause TEXT NOT NULL DEFAULT '',
        solution   TEXT NOT NULL DEFAULT '',
        severity   TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('high', 'medium', 'low')),
        status     TEXT NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new', 'analysis', 'resolved', 'verified')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX idx_bugs_status ON bugs (status);
    `,
  },
  {
    version: 10,
    name: 'journal',
    // The date is the key: one entry per local calendar day.
    up: `
      CREATE TABLE journal_entries (
        date       TEXT PRIMARY KEY CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        text       TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `,
  },
  {
    version: 11,
    name: 'task_reminders',
    // reminder_at is a local `YYYY-MM-DDTHH:mm[:ss]`; reminder_notified_at is the UTC instant it fired.
    up: `
      ALTER TABLE tasks ADD COLUMN reminder_at TEXT;
      ALTER TABLE tasks ADD COLUMN reminder_notified_at TEXT;
    `,
  },
  {
    version: 12,
    name: 'global_search',
    // One FTS5 table for every searchable kind. Triggers keep it in sync with the source
    // tables, so any write path (create, edit, convert, delete) is reflected at once.
    // unicode61 with remove_diacritics folds case and accents ("Información" ~ "informacion").
    up: `
      CREATE VIRTUAL TABLE search_index USING fts5(
        kind UNINDEXED,
        ref_id UNINDEXED,
        title,
        tokenize = 'unicode61 remove_diacritics 2'
      );
      INSERT INTO search_index (kind, ref_id, title) SELECT 'task', id, title FROM tasks;
      INSERT INTO search_index (kind, ref_id, title) SELECT 'inbox', id, title FROM inbox_items;

      CREATE TRIGGER search_tasks_insert AFTER INSERT ON tasks BEGIN
        INSERT INTO search_index (kind, ref_id, title) VALUES ('task', new.id, new.title);
      END;
      CREATE TRIGGER search_tasks_update AFTER UPDATE OF title ON tasks BEGIN
        UPDATE search_index SET title = new.title WHERE kind = 'task' AND ref_id = old.id;
      END;
      CREATE TRIGGER search_tasks_delete AFTER DELETE ON tasks BEGIN
        DELETE FROM search_index WHERE kind = 'task' AND ref_id = old.id;
      END;

      CREATE TRIGGER search_inbox_insert AFTER INSERT ON inbox_items BEGIN
        INSERT INTO search_index (kind, ref_id, title) VALUES ('inbox', new.id, new.title);
      END;
      CREATE TRIGGER search_inbox_update AFTER UPDATE OF title ON inbox_items BEGIN
        UPDATE search_index SET title = new.title WHERE kind = 'inbox' AND ref_id = old.id;
      END;
      CREATE TRIGGER search_inbox_delete AFTER DELETE ON inbox_items BEGIN
        DELETE FROM search_index WHERE kind = 'inbox' AND ref_id = old.id;
      END;
    `,
  },
  {
    version: 13,
    name: 'snippets',
    // Tags reuse the shared `tags` table. Origin (wiki note) is optional for snippets saved
    // from the wiki later; loose snippets leave it NULL.
    up: `
      CREATE TABLE snippets (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT NOT NULL,
        type       TEXT NOT NULL CHECK (type IN ('sql', 'command')),
        content    TEXT NOT NULL,
        origin     TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE snippet_tags (
        snippet_id INTEGER NOT NULL REFERENCES snippets (id) ON DELETE CASCADE,
        tag_id     INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
        PRIMARY KEY (snippet_id, tag_id)
      ) STRICT, WITHOUT ROWID;
      CREATE INDEX idx_snippet_tags_tag ON snippet_tags (tag_id);
    `,
  },
  {
    version: 14,
    name: 'learning_topics',
    up: `
      CREATE TABLE topics (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT NOT NULL,
        notes      TEXT NOT NULL DEFAULT '',
        status     TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `,
  },
  {
    version: 15,
    name: 'report_portal',
    // SQLite cannot alter a CHECK, so inbox_items is rebuilt (ids and the id counter are kept)
    // and its search triggers recreated. The reporter's name lives apart so the inbox row
    // stays the same shape for every source.
    up: `
      CREATE TABLE inbox_items_new (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT NOT NULL,
        source     TEXT NOT NULL CHECK (source IN ('quick_capture', 'portal')),
        created_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO inbox_items_new (id, title, source, created_at)
        SELECT id, title, source, created_at FROM inbox_items;
      DELETE FROM sqlite_sequence WHERE name = 'inbox_items_new';
      INSERT INTO sqlite_sequence (name, seq)
        SELECT 'inbox_items_new', seq FROM sqlite_sequence WHERE name = 'inbox_items';
      DROP TABLE inbox_items;
      ALTER TABLE inbox_items_new RENAME TO inbox_items;
      CREATE INDEX idx_inbox_items_created ON inbox_items (created_at DESC, id DESC);

      CREATE TRIGGER search_inbox_insert AFTER INSERT ON inbox_items BEGIN
        INSERT INTO search_index (kind, ref_id, title) VALUES ('inbox', new.id, new.title);
      END;
      CREATE TRIGGER search_inbox_update AFTER UPDATE OF title ON inbox_items BEGIN
        UPDATE search_index SET title = new.title WHERE kind = 'inbox' AND ref_id = old.id;
      END;
      CREATE TRIGGER search_inbox_delete AFTER DELETE ON inbox_items BEGIN
        DELETE FROM search_index WHERE kind = 'inbox' AND ref_id = old.id;
      END;

      CREATE TABLE portal_links (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        token           TEXT NOT NULL UNIQUE,
        project_id      INTEGER REFERENCES projects (id) ON DELETE SET NULL,
        created_at      TEXT NOT NULL,
        expires_at      TEXT NOT NULL,
        max_submissions INTEGER NOT NULL,
        submissions     INTEGER NOT NULL DEFAULT 0,
        revoked_at      TEXT
      ) STRICT;
      CREATE TABLE portal_reports (
        item_id  INTEGER PRIMARY KEY REFERENCES inbox_items (id) ON DELETE CASCADE,
        reporter TEXT NOT NULL,
        link_id  INTEGER REFERENCES portal_links (id) ON DELETE SET NULL
      ) STRICT;
    `,
  },
  {
    version: 16,
    name: 'wiki_sections',
    // Sections are the folders of wiki/ (one level). Like the rest of the notes table this is an
    // index rebuilt from the files: `section` is the folder, `sort_order` the frontmatter `order`.
    up: `
      ALTER TABLE notes ADD COLUMN section TEXT;
      ALTER TABLE notes ADD COLUMN sort_order INTEGER;
      ALTER TABLE notes ADD COLUMN description TEXT;
      CREATE TABLE note_sections (
        name       TEXT PRIMARY KEY,
        title      TEXT NOT NULL,
        sort_order INTEGER
      ) STRICT;
    `,
  },
  {
    version: 17,
    name: 'note_search',
    // Wiki notes in the global search (RF-10). `rowid` = notes.id. Titles are kept in step by
    // triggers; the body lives only in the .md files, so the wiki code fills it on every write and
    // `rebuildIndex` refills it at startup (existing notes are searchable by title until then).
    up: `
      CREATE VIRTUAL TABLE note_search USING fts5(
        title,
        body,
        tokenize = 'unicode61 remove_diacritics 2'
      );
      INSERT INTO note_search (rowid, title, body) SELECT id, title, '' FROM notes;

      CREATE TRIGGER note_search_insert AFTER INSERT ON notes BEGIN
        INSERT INTO note_search (rowid, title, body) VALUES (new.id, new.title, '');
      END;
      CREATE TRIGGER note_search_update AFTER UPDATE OF title ON notes BEGIN
        UPDATE note_search SET title = new.title WHERE rowid = old.id;
      END;
      CREATE TRIGGER note_search_delete AFTER DELETE ON notes BEGIN
        DELETE FROM note_search WHERE rowid = old.id;
      END;
    `,
  },
];

export function currentVersion(db: Database.Database): number {
  return db.pragma('user_version', { simple: true }) as number;
}

/** Applies pending migrations in a single transaction and returns the new version. */
export function migrate(db: Database.Database, list: Migration[] = migrations): number {
  const from = currentVersion(db);
  const pending = list.filter((m) => m.version > from).sort((a, b) => a.version - b.version);

  const apply = db.transaction(() => {
    for (const migration of pending) {
      db.exec(migration.up);
      db.pragma(`user_version = ${migration.version}`);
    }
  });
  apply();

  return currentVersion(db);
}
