/** Wiki notes (RF-08). Shared so main and renderer parse `[[links]]` and validate alike. */

export const NOTE_TITLE_MAX_LENGTH = 200;
export const NOTE_CONTENT_MAX_LENGTH = 500_000;

export interface NoteSummary {
  /** File name without `.md`; the stable reference to a note. */
  slug: string;
  title: string;
  /** ISO-8601 UTC timestamps. */
  createdAt: string;
  updatedAt: string;
}

/** A `[[link]]` found in a note. `slug` is null while no note has that title (pending). */
export interface NoteLink {
  label: string;
  key: string;
  slug: string | null;
}

export interface Note extends NoteSummary {
  content: string;
  links: NoteLink[];
  /** Notes that link to this one. */
  backlinks: NoteSummary[];
}

export interface NoteInput {
  title: string;
  content: string;
}

export type NoteError = 'empty' | 'too_long' | 'invalid' | 'duplicate' | 'not_found' | 'io';

export type NoteResult = { ok: true; note: Note } | { ok: false; error: NoteError };

/** Links resolve by title, ignoring case and surrounding whitespace. */
export function noteKey(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Trims and checks title and content. Content may be empty. */
export function validateNoteInput(
  input: unknown,
): { ok: true; title: string; content: string } | { ok: false; error: NoteError } {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'invalid' };
  const { title, content } = input as Record<string, unknown>;
  if (typeof title !== 'string' || typeof content !== 'string') {
    return { ok: false, error: 'invalid' };
  }
  const trimmed = title.trim();
  if (trimmed.length === 0) return { ok: false, error: 'empty' };
  if (trimmed.length > NOTE_TITLE_MAX_LENGTH) return { ok: false, error: 'too_long' };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(trimmed)) return { ok: false, error: 'invalid' };
  if (content.length > NOTE_CONTENT_MAX_LENGTH) return { ok: false, error: 'too_long' };
  return { ok: true, title: trimmed, content };
}

/** A note reference coming over IPC: a bare file name, never a path. */
export function isValidSlug(slug: unknown): slug is string {
  return (
    typeof slug === 'string' &&
    slug.length > 0 &&
    slug.length <= 255 &&
    // eslint-disable-next-line no-control-regex
    !/[\\/:*?"<>|\u0000-\u001f]/.test(slug) &&
    !slug.includes('..') &&
    slug === slug.trim()
  );
}

const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** File name (without extension) for a title: never contains separators or `..`. */
export function slugFromTitle(title: string): string {
  let slug = title
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\.{2,}/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-{2,}/g, '-')
    .trim()
    .replace(/^[.\-\s]+|[.\-\s]+$/g, '');
  slug = slug.slice(0, 100).trim();
  if (slug === '') return 'nota';
  if (RESERVED_NAMES.test(slug)) return `${slug}-nota`;
  return slug;
}

const WIKILINK = /\[\[([^[\]\n|]+)\]\]/g;

/** Content with fenced and inline code removed, so links inside code are ignored. */
function withoutCode(content: string): string {
  const kept: string[] = [];
  let fence: string | null = null;
  for (const line of content.split(/\r?\n/)) {
    const marker = /^\s{0,3}(```|~~~)/.exec(line)?.[1];
    if (fence === null && marker) fence = marker;
    else if (fence !== null && marker === fence) fence = null;
    else if (fence === null) kept.push(line.replace(/`[^`\n]*`/g, ''));
  }
  return kept.join('\n');
}

/** Distinct `[[links]]` of a note, in order of appearance, ignoring code. */
export function extractLinks(content: string): { label: string; key: string }[] {
  const seen = new Map<string, string>();
  for (const match of withoutCode(content).matchAll(WIKILINK)) {
    const label = match[1].trim().replace(/\s+/g, ' ');
    if (label === '') continue;
    const key = noteKey(label);
    if (!seen.has(key)) seen.set(key, label);
  }
  return [...seen].map(([key, label]) => ({ label, key }));
}

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'link'; label: string; key: string };

export type Block =
  | { type: 'heading'; level: number; inline: Inline[] }
  | { type: 'paragraph'; inline: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'list'; ordered: boolean; items: Inline[][] };

const INLINE = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\[\[([^[\]\n|]+)\]\]/g;

function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ type: 'code', text: m[1] });
    else if (m[2] !== undefined) out.push({ type: 'strong', text: m[2] });
    else {
      const label = m[3].trim().replace(/\s+/g, ' ');
      out.push({ type: 'link', label, key: noteKey(label) });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

/**
 * Minimal Markdown for the reading view: headings, paragraphs, lists, fenced code,
 * `code`, **bold** and `[[links]]`. Produces data, never HTML, so nothing is injected.
 */
export function parseMarkdown(content: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;
  let code: { marker: string; lines: string[] } | null = null;

  const flush = (): void => {
    if (paragraph.length)
      blocks.push({ type: 'paragraph', inline: parseInline(paragraph.join(' ')) });
    if (list) blocks.push({ type: 'list', ...list });
    paragraph = [];
    list = null;
  };

  for (const line of content.split(/\r?\n/)) {
    const fence = /^\s{0,3}(```|~~~)/.exec(line)?.[1];
    if (code) {
      if (fence === code.marker) {
        blocks.push({ type: 'code', text: code.lines.join('\n') });
        code = null;
      } else code.lines.push(line);
      continue;
    }
    if (fence) {
      flush();
      code = { marker: fence, lines: [] };
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const item = /^\s*(?:([-*+])|\d+[.)])\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', level: heading[1].length, inline: parseInline(heading[2]) });
    } else if (item) {
      const ordered = item[1] === undefined;
      if (paragraph.length || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push(parseInline(item[2]));
    } else if (line.trim() === '') {
      flush();
    } else {
      if (list) flush();
      paragraph.push(line.trim());
    }
  }
  if (code) blocks.push({ type: 'code', text: code.lines.join('\n') });
  flush();
  return blocks;
}
