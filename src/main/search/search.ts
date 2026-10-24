import type Database from 'better-sqlite3';
import { extractToc } from '../../shared/wiki';
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

const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Id of the first `##`/`###` heading where every typed term starts a word, as the index matches. */
function matchingHeading(body: string, text: string): string | undefined {
  const terms = (text.match(/[\p{L}\p{N}]+/gu) ?? []).map(fold);
  if (!/^#{2,3}[ \t]/m.test(body)) return undefined;
  return extractToc(body).find((entry) => {
    const words = fold(entry.text).match(/[\p{L}\p{N}]+/gu) ?? [];
    return terms.every((term) => words.some((word) => word.startsWith(term)));
  })?.id;
}

interface RankedResult {
  rank: number;
  result: SearchResult;
}

function searchNotes(db: Database.Database, match: string, text: string): RankedResult[] {
  const rows = db
    .prepare(
      `SELECT n.id, n.slug, n.title, COALESCE(s.title, n.section) AS section,
              bm25(note_search, 5, 1) AS rank, body,
              snippet(note_search, 1, '', '', '…', 16) AS snippet
       FROM note_search JOIN notes n ON n.id = note_search.rowid
       LEFT JOIN note_sections s ON s.name = n.section
       WHERE note_search MATCH ? ORDER BY rank, n.id LIMIT ?`,
    )
    .all(match, MAX_SEARCH_RESULTS) as {
    id: number;
    slug: string;
    title: string;
    section: string | null;
    rank: number;
    body: string;
    snippet: string;
  }[];
  return rows.map((row) => {
    const heading = matchingHeading(row.body, text);
    return {
      rank: row.rank,
      result: {
        kind: 'note',
        id: row.id,
        title: row.title,
        slug: row.slug,
        ...(row.section !== null && { section: row.section }),
        snippet: row.snippet.replace(/\s+/g, ' ').trim(),
        ...(heading !== undefined && { heading }),
      },
    };
  });
}

/**
 * Throws on a malformed payload. Tasks and inbox items by title and wiki notes by title and text,
 * every typed term matching as a prefix; best first, at most `MAX_SEARCH_RESULTS` in all.
 */
export function search(db: Database.Database, text: unknown): SearchResult[] {
  if (!isValidSearchQuery(text)) throw new Error('Invalid search query');
  const match = toMatchQuery(text);
  if (!match) return [];
  const rows = db
    .prepare(
      `SELECT kind, ref_id, title, rank FROM search_index
       WHERE search_index MATCH ? ORDER BY rank, ref_id LIMIT ?`,
    )
    .all(match, MAX_SEARCH_RESULTS) as {
    kind: SearchKind;
    ref_id: number;
    title: string;
    rank: number;
  }[];
  const ranked: RankedResult[] = rows.map((row) => ({
    rank: row.rank,
    result: { kind: row.kind, id: row.ref_id, title: row.title },
  }));
  ranked.push(...searchNotes(db, match, text));
  // Stable: equal relevance keeps tasks and inbox ahead of notes.
  ranked.sort((a, b) => a.rank - b.rank);
  return ranked.slice(0, MAX_SEARCH_RESULTS).map((r) => r.result);
}
