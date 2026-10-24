/** Global search (RF-10). New searchable kinds are added here and as triggers in a migration. */
export type SearchKind = 'task' | 'inbox' | 'note';

export const SEARCH_KINDS: readonly SearchKind[] = ['task', 'inbox', 'note'];

export interface SearchResult {
  kind: SearchKind;
  id: number;
  title: string;
  /** Notes only: file name (the key to open it), section title, text around the match, and the id of the matching `##`/`###` heading. */
  slug?: string;
  section?: string;
  snippet?: string;
  heading?: string;
}

export const MAX_SEARCH_LENGTH = 200;
export const MAX_SEARCH_RESULTS = 50;

/** A search payload is a string of at most `MAX_SEARCH_LENGTH` characters. */
export function isValidSearchQuery(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_SEARCH_LENGTH;
}
