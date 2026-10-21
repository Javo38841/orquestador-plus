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
