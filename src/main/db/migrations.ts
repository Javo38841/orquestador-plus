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
