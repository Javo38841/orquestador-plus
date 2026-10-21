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
