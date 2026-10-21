import type Database from 'better-sqlite3';
import {
  isValidSearchQuery,
  MAX_SEARCH_RESULTS,
  type SearchKind,
  type SearchResult,
} from '../../shared/search';

/**
 * Turns free text into a safe FTS5 expression: every run of letters/digits becomes a quoted
 * prefix term, so operators and punctuation (`"`, `*`, `-`, `AND`, parentheses) are literal.
 */
export function toMatchQuery(text: string): string | null {
  const terms = text.match(/[\p{L}\p{N}]+/gu);
  return terms ? terms.map((term) => `"${term}"*`).join(' ') : null;
}

/** Throws on a malformed payload. Tasks and inbox items whose title matches every typed term (prefix match), best first. */
export function search(db: Database.Database, text: unknown): SearchResult[] {
  if (!isValidSearchQuery(text)) throw new Error('Invalid search query');
  const match = toMatchQuery(text);
  if (!match) return [];
  const rows = db
    .prepare(
      `SELECT kind, ref_id, title FROM search_index
       WHERE search_index MATCH ? ORDER BY rank, ref_id LIMIT ?`,
    )
    .all(match, MAX_SEARCH_RESULTS) as { kind: SearchKind; ref_id: number; title: string }[];
  return rows.map((row) => ({ kind: row.kind, id: row.ref_id, title: row.title }));
}
