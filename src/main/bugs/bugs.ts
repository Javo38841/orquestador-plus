import type Database from 'better-sqlite3';
import {
  bugCode,
  isBugStatus,
  validateBugInput,
  type Bug,
  type BugResult,
  type BugSeverity,
  type BugStatus,
} from '../../shared/bugs';

interface BugRow {
  id: number;
  title: string;
  symptom: string;
  impact: string;
  root_cause: string;
  solution: string;
  severity: BugSeverity;
  status: BugStatus;
  created_at: string;
  updated_at: string;
}

const SELECT_BUG =
  'SELECT id, title, symptom, impact, root_cause, solution, severity, status, created_at, updated_at FROM bugs';

function toBug(row: BugRow): Bug {
  return {
    id: row.id,
    code: bugCode(row.id),
    title: row.title,
    symptom: row.symptom,
    impact: row.impact,
    rootCause: row.root_cause,
    solution: row.solution,
    severity: row.severity,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getBug(db: Database.Database, id: number): Bug | null {
  const row = db.prepare(`${SELECT_BUG} WHERE id = ?`).get(id) as BugRow | undefined;
  return row ? toBug(row) : null;
}

function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/** All bugs, newest first. */
export function listBugs(db: Database.Database): Bug[] {
  const rows = db.prepare(`${SELECT_BUG} ORDER BY id DESC`).all() as BugRow[];
  return rows.map(toBug);
}

export function createBug(db: Database.Database, input: unknown, now = new Date()): BugResult {
  const checked = validateBugInput(input);
  if (!checked.ok) return checked;
  const stamp = now.toISOString();
  const info = db
    .prepare(
      `INSERT INTO bugs (title, symptom, impact, root_cause, solution, severity, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      checked.title,
      checked.symptom,
      checked.impact,
      checked.rootCause,
      checked.solution,
      checked.severity,
      stamp,
      stamp,
    );
  return { ok: true, bug: getBug(db, Number(info.lastInsertRowid))! };
}

export function updateBug(
  db: Database.Database,
  id: unknown,
  input: unknown,
  now = new Date(),
): BugResult {
  const checked = validateBugInput(input);
  if (!checked.ok) return checked;
  if (!isId(id) || !getBug(db, id)) return { ok: false, error: 'not_found' };
  db.prepare(
    `UPDATE bugs SET title = ?, symptom = ?, impact = ?, root_cause = ?, solution = ?, severity = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    checked.title,
    checked.symptom,
    checked.impact,
    checked.rootCause,
    checked.solution,
    checked.severity,
    now.toISOString(),
    id,
  );
  return { ok: true, bug: getBug(db, id)! };
}

/** Status can move freely, including reopening a resolved bug. */
export function setBugStatus(
  db: Database.Database,
  id: unknown,
  status: unknown,
  now = new Date(),
): BugResult {
  if (!isBugStatus(status)) return { ok: false, error: 'invalid' };
  if (!isId(id) || !getBug(db, id)) return { ok: false, error: 'not_found' };
  db.prepare('UPDATE bugs SET status = ?, updated_at = ? WHERE id = ?').run(
    status,
    now.toISOString(),
    id,
  );
  return { ok: true, bug: getBug(db, id)! };
}

export function deleteBug(db: Database.Database, id: unknown): boolean {
  if (!isId(id)) return false;
  return db.prepare('DELETE FROM bugs WHERE id = ?').run(id).changes > 0;
}
