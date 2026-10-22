import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { openDatabase } from './db/database';

export const WIKI_FOLDER = 'wiki';
export const ATTACHMENTS_FOLDER = 'adjuntos';

export interface Storage {
  db: Database.Database;
  wikiDir: string;
  attachmentsDir: string;
}

/**
 * Prepares the data folder on first launch with no user input (RNF-09): creates the
 * folder, the database with every migration applied, and the missing subfolders.
 * Safe to run on an existing folder: it never touches data that is already there.
 */
export function initStorage(dataDir: string): Storage {
  const wikiDir = path.join(dataDir, WIKI_FOLDER);
  const attachmentsDir = path.join(dataDir, ATTACHMENTS_FOLDER);
  fs.mkdirSync(wikiDir, { recursive: true });
  fs.mkdirSync(attachmentsDir, { recursive: true });
  const db = openDatabase(dataDir);
  return { db, wikiDir, attachmentsDir };
}
