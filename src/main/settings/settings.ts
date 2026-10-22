import type Database from 'better-sqlite3';
import { isSnippetsView, type SnippetsView } from '../../shared/snippets';
import { isBoardSelection, parseBoardSelection, type BoardSelection } from '../../shared/board';

const REMINDERS_ENABLED = 'reminders.enabled';
const BOARD_PROJECT = 'board.project';
const BOARD_PANEL_OPEN = 'board.panelOpen';
const SNIPPETS_VIEW = 'snippets.view';

/** Task reminders notify unless the user turned them off (RF-18). */
export function getRemindersEnabled(db: Database.Database): boolean {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(REMINDERS_ENABLED) as
    { value: string } | undefined;
  return row?.value !== '0';
}

/** Persists the reminders switch; anything but a boolean is rejected. Returns the stored value. */
export function setRemindersEnabled(db: Database.Database, enabled: unknown): boolean {
  if (typeof enabled !== 'boolean') throw new Error('Invalid reminders setting');
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
  ).run(REMINDERS_ENABLED, enabled ? '1' : '0');
  return enabled;
}

/** The board the Tablero last showed; a missing or corrupt setting is "General". */
export function getBoardProject(db: Database.Database): BoardSelection {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(BOARD_PROJECT) as
    { value: string } | undefined;
  return parseBoardSelection(row?.value);
}

/** Remembers the chosen board; anything but 'general', 'loose' or a project id is rejected. Returns the stored value. */
export function setBoardProject(db: Database.Database, selection: unknown): BoardSelection {
  if (!isBoardSelection(selection)) throw new Error('Invalid board selection');
  if (selection === 'general') {
    db.prepare('DELETE FROM settings WHERE key = ?').run(BOARD_PROJECT);
    return selection;
  }
  const value = selection === 'loose' ? 'loose' : String(selection.projectId);
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
  ).run(BOARD_PROJECT, value);
  return selection;
}

/** The Tablero's projects panel is open unless the user folded it. */
export function getBoardPanelOpen(db: Database.Database): boolean {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(BOARD_PANEL_OPEN) as
    { value: string } | undefined;
  return row?.value !== '0';
}

/** Remembers whether the projects panel is open; anything but a boolean is rejected. */
export function setBoardPanelOpen(db: Database.Database, open: unknown): boolean {
  if (typeof open !== 'boolean') throw new Error('Invalid board panel setting');
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
  ).run(BOARD_PANEL_OPEN, open ? '1' : '0');
  return open;
}

/** Snippets show as a grid unless the user chose the list; a corrupt setting is the grid. */
export function getSnippetsView(db: Database.Database): SnippetsView {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(SNIPPETS_VIEW) as
    { value: string } | undefined;
  return isSnippetsView(row?.value) ? row.value : 'grid';
}

/** Remembers the Snippets layout; anything but 'grid' or 'list' is rejected. Returns the stored value. */
export function setSnippetsView(db: Database.Database, view: unknown): SnippetsView {
  if (!isSnippetsView(view)) throw new Error('Invalid snippets view');
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
  ).run(SNIPPETS_VIEW, view);
  return view;
}
