/** Snippets and commands (RF-13). Shared so main and renderer validate and filter alike. */
import { validateTags } from './tasks';

export const SNIPPET_TITLE_MAX_LENGTH = 200;
export const SNIPPET_CONTENT_MAX_LENGTH = 100_000;

export const SNIPPET_TYPES = ['sql', 'command'] as const;
export type SnippetType = (typeof SNIPPET_TYPES)[number];

export type SnippetTypeFilter = 'all' | SnippetType;

export interface Snippet {
  id: number;
  title: string;
  type: SnippetType;
  /** Stored verbatim: line breaks and spaces are part of what gets copied. */
  content: string;
  /** Normalized tags (lowercase, no leading `#`), alphabetical. */
  tags: string[];
  /** ISO-8601 UTC timestamps. */
  createdAt: string;
  updatedAt: string;
}

export interface SnippetInput {
  title: string;
  type: SnippetType;
  content: string;
  /** Raw tags as typed; main normalizes them. Omitted means no tags. */
  tags?: string[];
}

export type SnippetError =
  | 'empty_title'
  | 'empty_content'
  | 'too_long'
  | 'invalid'
  | 'invalid_tags'
  | 'tag_empty'
  | 'tag_too_long'
  | 'tag_spaces'
  | 'not_found';

export type SnippetResult = { ok: true; snippet: Snippet } | { ok: false; error: SnippetError };

export function isSnippetType(value: unknown): value is SnippetType {
  return typeof value === 'string' && (SNIPPET_TYPES as readonly string[]).includes(value);
}

/** Snippets of the chosen type (or all) that carry the tag (or any tag when `tag` is null). */
export function filterSnippets(
  snippets: Snippet[],
  type: SnippetTypeFilter,
  tag: string | null,
): Snippet[] {
  return snippets.filter(
    (s) => (type === 'all' || s.type === type) && (tag === null || s.tags.includes(tag)),
  );
}

/** Distinct tags across the snippets, alphabetical. */
export function snippetTags(snippets: Snippet[]): string[] {
  return [...new Set(snippets.flatMap((s) => s.tags))].sort();
}

export interface ValidSnippetInput {
  title: string;
  type: SnippetType;
  content: string;
  tags: string[];
}

/** Checks a snippet form. The title is trimmed; the content is kept exactly as typed. */
export function validateSnippetInput(
  input: unknown,
): ({ ok: true } & ValidSnippetInput) | { ok: false; error: SnippetError } {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'invalid' };
  const raw = input as Record<string, unknown>;
  if (typeof raw['title'] !== 'string' || typeof raw['content'] !== 'string') {
    return { ok: false, error: 'invalid' };
  }
  if (!isSnippetType(raw['type'])) return { ok: false, error: 'invalid' };

  const title = raw['title'].trim();
  const content = raw['content'];
  if (title.length === 0) return { ok: false, error: 'empty_title' };
  if (content.trim().length === 0) return { ok: false, error: 'empty_content' };
  if (title.length > SNIPPET_TITLE_MAX_LENGTH || content.length > SNIPPET_CONTENT_MAX_LENGTH) {
    return { ok: false, error: 'too_long' };
  }

  const tags = validateTags(raw['tags']);
  if (!tags.ok) return { ok: false, error: tags.error };

  return { ok: true, title, type: raw['type'], content, tags: tags.tags };
}
