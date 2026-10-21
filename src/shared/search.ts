/** Global search (RF-10). New searchable kinds are added here and as triggers in a migration. */
export type SearchKind = 'task' | 'inbox';

export const SEARCH_KINDS: readonly SearchKind[] = ['task', 'inbox'];

export interface SearchResult {
  kind: SearchKind;
  id: number;
  title: string;
}

export const MAX_SEARCH_LENGTH = 200;
export const MAX_SEARCH_RESULTS = 50;

/** A search payload is a string of at most `MAX_SEARCH_LENGTH` characters. */
export function isValidSearchQuery(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_SEARCH_LENGTH;
}
