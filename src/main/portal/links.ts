import { randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  validateLinkInput,
  type PortalLink,
  type PortalLinkResult,
  type PortalLinkStatus,
} from '../../shared/portal';

interface LinkRow {
  id: number;
  token: string;
  project_id: number | null;
  project_name: string | null;
  created_at: string;
  expires_at: string;
  max_submissions: number;
  submissions: number;
  revoked_at: string | null;
}

const SELECT_LINK = `SELECT l.id, l.token, l.project_id, p.name AS project_name, l.created_at,
  l.expires_at, l.max_submissions, l.submissions, l.revoked_at
  FROM portal_links l LEFT JOIN projects p ON p.id = l.project_id`;

export function linkStatus(row: LinkRow, now: Date): PortalLinkStatus {
  if (row.revoked_at !== null) return 'revoked';
  if (Date.parse(row.expires_at) <= now.getTime()) return 'expired';
  if (row.submissions >= row.max_submissions) return 'exhausted';
  return 'active';
}

function toLink(row: LinkRow, now: Date): PortalLink {
  return {
    id: row.id,
    token: row.token,
    projectId: row.project_id,
    projectName: row.project_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    maxSubmissions: row.max_submissions,
    submissions: row.submissions,
    status: linkStatus(row, now),
  };
}

/** Links, newest first. */
export function listLinks(db: Database.Database, now: Date = new Date()): PortalLink[] {
  const rows = db.prepare(`${SELECT_LINK} ORDER BY l.id DESC`).all() as LinkRow[];
  return rows.map((row) => toLink(row, now));
}

/** Creates a link with an unguessable token that expires and accepts a limited number of reports. */
export function createLink(
  db: Database.Database,
  input: unknown,
  now: Date = new Date(),
): PortalLinkResult {
  const checked = validateLinkInput(input);
  if (!checked.ok) return checked;
  const { projectId, expiresInHours, maxSubmissions } = checked.value;
  if (projectId !== null && !db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) {
    return { ok: false, error: 'invalid_project' };
  }
  const expiresAt = new Date(now.getTime() + expiresInHours * 3_600_000).toISOString();
  const info = db
    .prepare(
      `INSERT INTO portal_links (token, project_id, created_at, expires_at, max_submissions)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      randomBytes(24).toString('base64url'),
      projectId,
      now.toISOString(),
      expiresAt,
      maxSubmissions,
    );
  const row = db
    .prepare(`${SELECT_LINK} WHERE l.id = ?`)
    .get(Number(info.lastInsertRowid)) as LinkRow;
  return { ok: true, link: toLink(row, now) };
}

/** Revokes a link for good. Returns whether it existed. */
export function revokeLink(db: Database.Database, id: unknown, now: Date = new Date()): boolean {
  if (typeof id !== 'number' || !Number.isInteger(id)) return false;
  return (
    db
      .prepare('UPDATE portal_links SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
      .run(now.toISOString(), id).changes > 0
  );
}

export type SubmitOutcome =
  | { ok: true; itemId: number }
  | { ok: false; reason: 'unknown_token' | 'revoked' | 'expired' | 'limit' };

/**
 * Stores a validated report as an inbox item, and counts it against the link, in one
 * transaction (RNF-08). The link is re-checked inside it so concurrent posts cannot pass the limit.
 */
export function submitReport(
  db: Database.Database,
  token: string,
  report: { name: string; description: string },
  now: Date = new Date(),
): SubmitOutcome {
  return db.transaction((): SubmitOutcome => {
    const row = db.prepare(`${SELECT_LINK} WHERE l.token = ?`).get(token) as LinkRow | undefined;
    if (!row) return { ok: false, reason: 'unknown_token' };
    const status = linkStatus(row, now);
    if (status === 'revoked') return { ok: false, reason: 'revoked' };
    if (status === 'expired') return { ok: false, reason: 'expired' };
    if (status === 'exhausted') return { ok: false, reason: 'limit' };
    const info = db
      .prepare("INSERT INTO inbox_items (title, source, created_at) VALUES (?, 'portal', ?)")
      .run(report.description, now.toISOString());
    const itemId = Number(info.lastInsertRowid);
    db.prepare('INSERT INTO portal_reports (item_id, reporter, link_id) VALUES (?, ?, ?)').run(
      itemId,
      report.name,
      row.id,
    );
    db.prepare('UPDATE portal_links SET submissions = submissions + 1 WHERE id = ?').run(row.id);
    return { ok: true, itemId };
  })();
}
