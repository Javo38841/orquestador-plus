import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { ASSETS_SUFFIX } from '../../shared/attachments';
import type { ExportResult } from '../../shared/export';
import { toCsv, type CsvValue } from './csv';
import { createZip, type ZipEntry } from './zip';

/**
 * Tables exported as `<name>.json` + `<name>.csv`, each with all rows and columns.
 * Every story that adds a module with user data must add its table here. Portal links
 * (tokens) and settings are deliberately left out.
 */
export const EXPORT_TABLES: { name: string; orderBy: string }[] = [
  { name: 'projects', orderBy: 'id' },
  { name: 'tasks', orderBy: 'id' },
  { name: 'task_series', orderBy: 'id' },
  { name: 'tags', orderBy: 'id' },
  { name: 'task_tags', orderBy: 'task_id, tag_id' },
  { name: 'inbox_items', orderBy: 'id' },
];

const WIKI_FOLDER = 'wiki';

function markdownIn(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isFile() && e.name.endsWith('.md') ? [e.name] : []))
    .sort();
}

/** Files of the `*.assets` folders of `dir` (attachments), as paths relative to `dir`. */
function assetsIn(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() && e.name.endsWith(ASSETS_SUFFIX) ? [e.name] : []))
    .sort()
    .flatMap((folder) =>
      fs
        .readdirSync(path.join(dir, folder), { withFileTypes: true })
        .flatMap((f) => (f.isFile() ? [`${folder}/${f.name}`] : []))
        .sort(),
    );
}

/**
 * Notes in the root and in the folders directly under `wiki/` (sections), with their paths, followed by
 * the attachments in the `*.assets` folders next to them. Symbolic links are never followed.
 */
function wikiEntries(wikiDir: string): ZipEntry[] {
  let folders: string[];
  try {
    folders = fs
      .readdirSync(wikiDir, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() && !e.name.endsWith(ASSETS_SUFFIX) ? [e.name] : []))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return ['', ...folders].flatMap((folder) => {
    const dir = path.join(wikiDir, folder);
    return [...markdownIn(dir), ...assetsIn(dir)].map((name) => ({
      name: [WIKI_FOLDER, folder, name].filter(Boolean).join('/'),
      data: fs.readFileSync(path.join(dir, name)),
    }));
  });
}

/** Builds the ZIP of everything: tables read in one transaction (a consistent snapshot) and wiki/. */
export function buildExport(db: Database.Database, wikiDir: string): Buffer {
  const read = db.transaction((): ZipEntry[] =>
    EXPORT_TABLES.flatMap(({ name, orderBy }) => {
      const statement = db.prepare(`SELECT * FROM ${name} ORDER BY ${orderBy}`);
      const columns = statement.columns().map((c) => c.name);
      const rows = statement.all() as Record<string, CsvValue>[];
      const csv = toCsv(
        columns,
        rows.map((row) => columns.map((c) => row[c] ?? null)),
      );
      return [
        { name: `${name}.json`, data: Buffer.from(JSON.stringify(rows, null, 2) + '\n', 'utf8') },
        { name: `${name}.csv`, data: Buffer.from(csv, 'utf8') },
      ];
    }),
  );
  // Notes are files; they are read right after the snapshot and copied byte for byte.
  return createZip([...read(), ...wikiEntries(wikiDir)]);
}

export interface ExportDeps {
  db: Database.Database | null;
  wikiDir: string;
  /** Opens the save dialog; resolves the chosen file, or null if the user cancelled. */
  chooseFile(defaultName: string): Promise<string | null>;
  now?: () => Date;
}

/** `orquestadorplus-YYYY-MM-DD.zip`, with the local date. */
export function defaultExportName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `orquestadorplus-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.zip`;
}

/**
 * IPC handler of "Exportar todo": takes no payload. The archive is written to a temporary
 * file and renamed, so a failure or a cancel never leaves a partial ZIP behind.
 */
export async function exportAll(deps: ExportDeps, payload?: unknown): Promise<ExportResult> {
  if (payload !== undefined) throw new Error('Invalid export payload');
  if (!deps.db) throw new Error('Database not available');

  const target = await deps.chooseFile(defaultExportName((deps.now ?? (() => new Date()))()));
  if (!target) return { ok: false, error: 'cancelled' };

  const temp = `${target}.part`;
  try {
    fs.writeFileSync(temp, buildExport(deps.db, deps.wikiDir));
    fs.renameSync(temp, target);
    return { ok: true, path: target };
  } catch {
    fs.rmSync(temp, { force: true });
    return { ok: false, error: 'write_failed' };
  }
}
