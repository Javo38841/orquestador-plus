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
  /** Folder under `wiki/` the note lives in; absent for notes in the root (one level only). */
  section?: string;
  /** Position inside its section (`order` in the frontmatter); absent = after the ordered ones. */
  order?: number;
  /** One-line summary from the frontmatter `description`. */
  description?: string;
}

/** A folder of `wiki/` with notes in it. `_section.md` may give it a title and an order. */
export interface SectionSummary {
  /** Folder name; the stable reference to a section. */
  name: string;
  title: string;
  order?: number;
}

/** A `[[link]]` found in a note. `slug` is null while no note has that title (pending). */
export interface NoteLink {
  label: string;
  key: string;
  slug: string | null;
}

export interface Note extends NoteSummary {
  content: string;
  /** Hash of the file as read; sent back when saving to detect a change made outside the app. */
  hash: string;
  links: NoteLink[];
  /** Files in the note's `.assets` folder; absent when it has none. */
  attachments?: number;
  /** Notes that link to this one. */
  backlinks: NoteSummary[];
}

export interface NoteInput {
  title: string;
  content: string;
  /** Folder to create the note in; omitted for the root. Ignored when editing. */
  section?: string;
  /** Editing only: `Note.hash` the edit started from. If the file differs now, the save is a conflict. */
  expectedHash?: string;
  /** Editing only: save over a conflict instead of reporting it. */
  overwrite?: boolean;
}

export type NoteError =
  'empty' | 'too_long' | 'invalid' | 'duplicate' | 'not_found' | 'conflict' | 'io';

/** Why a file of `wiki/` is not in the index. */
export type SkippedReason = 'duplicate' | 'unreadable' | 'invalid_name';

export interface SkippedFile {
  /** Path relative to `wiki/`, with `/` separators. */
  file: string;
  reason: SkippedReason;
}

export type NoteResult = { ok: true; note: Note } | { ok: false; error: NoteError };

/** Links resolve by title, ignoring case and surrounding whitespace. */
export function noteKey(title: string): string {
  return title.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Trims and checks title and content. Content may be empty. */
export function validateNoteInput(
  input: unknown,
):
  { ok: true; title: string; content: string; section?: string } | { ok: false; error: NoteError } {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'invalid' };
  const { title, content, section } = input as Record<string, unknown>;
  if (section !== undefined && !isValidSection(section)) return { ok: false, error: 'invalid' };
  if (typeof title !== 'string' || typeof content !== 'string') {
    return { ok: false, error: 'invalid' };
  }
  const trimmed = title.trim();
  if (trimmed.length === 0) return { ok: false, error: 'empty' };
  if (trimmed.length > NOTE_TITLE_MAX_LENGTH) return { ok: false, error: 'too_long' };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(trimmed)) return { ok: false, error: 'invalid' };
  if (content.length > NOTE_CONTENT_MAX_LENGTH) return { ok: false, error: 'too_long' };
  return section === undefined
    ? { ok: true, title: trimmed, content }
    : { ok: true, title: trimmed, content, section };
}

/** File that holds the title and order of a section; it is never a page. */
export const SECTION_FILE = '_section.md';

export interface SectionInput {
  /** Shown in the sidebar and used as the folder name under `wiki/`. */
  title: string;
}

export type SectionError = 'empty' | 'invalid' | 'duplicate' | 'io';

export type SectionResult =
  { ok: true; section: SectionSummary } | { ok: false; error: SectionError };

/** Trims the title; it must be usable as a folder name directly under `wiki/` (no `/`, `..`). */
export function validateSectionInput(
  input: unknown,
): { ok: true; title: string } | { ok: false; error: SectionError } {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'invalid' };
  const { title } = input as Record<string, unknown>;
  if (typeof title !== 'string') return { ok: false, error: 'invalid' };
  const trimmed = title.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) return { ok: false, error: 'empty' };
  if (!isValidSection(trimmed)) return { ok: false, error: 'invalid' };
  return { ok: true, title: trimmed };
}

/** Longest `description` kept from a frontmatter. */
export const NOTE_DESCRIPTION_MAX_LENGTH = 500;

/** A section name coming over IPC or read from disk: one bare folder name, never a path. */
export function isValidSection(section: unknown): section is string {
  return (
    typeof section === 'string' &&
    section.length > 0 &&
    section.length <= 255 &&
    // eslint-disable-next-line no-control-regex
    !/[\\/:*?"<>|\u0000-\u001f]/.test(section) &&
    !section.includes('..') &&
    section === section.trim() &&
    !section.endsWith('.') &&
    !section.startsWith('.') &&
    !section.startsWith('_') &&
    !section.toLowerCase().endsWith('.assets') &&
    !RESERVED_NAMES.test(section)
  );
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

/** Windows reserves these names with or without an extension (`CON.md`, `nul.backup.md`). */
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** File name (without extension) for a title: never contains separators or `..`. */
export function slugFromTitle(title: string): string {
  let slug = title
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\.{2,}/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-{2,}/g, '-')
    .trim()
    .replace(/^[.\-\s]+|[.\-\s]+$/g, '');
  // Cut by code points so an emoji is never split; trailing dots/spaces are invalid on Windows.
  slug = Array.from(slug)
    .slice(0, 100)
    .join('')
    .replace(/[.\-\s]+$/, '');
  if (slug === '') return 'nota';
  if (RESERVED_NAMES.test(slug)) return slug.replace(/^[^.]*/, '$&-nota');
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
  | { type: 'link'; label: string; key: string }
  /** `![alt](src)`: `src` is as written; `localTarget` says whether it may be loaded. */
  | { type: 'image'; alt: string; src: string }
  /** `[label](src)`: a file next to the note, or a link that is never followed. */
  | { type: 'file'; label: string; src: string };

export type CalloutKind = 'note' | 'tip' | 'caution';
export const CALLOUT_KINDS: readonly CalloutKind[] = ['note', 'tip', 'caution'];

export type TableAlign = 'left' | 'center' | 'right' | null;

export type Block =
  | { type: 'heading'; level: number; inline: Inline[] }
  | { type: 'paragraph'; inline: Inline[] }
  | { type: 'code'; text: string; lang?: string; title?: string }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'callout'; kind: CalloutKind; title?: string; blocks: Block[] }
  | { type: 'table'; align: TableAlign[]; header: Inline[][]; rows: Inline[][][] };

const INLINE =
  /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\[\[([^[\]\n|]+)\]\]|!\[([^[\]\n]*)\]\(([^()\s]+)\)|\[([^[\]\n]+)\]\(([^()\s]+)\)/g;

function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ type: 'code', text: m[1] });
    else if (m[2] !== undefined) out.push({ type: 'strong', text: m[2] });
    else if (m[5] !== undefined) out.push({ type: 'image', alt: m[4], src: m[5] });
    else if (m[7] !== undefined) out.push({ type: 'file', label: m[6], src: m[7] });
    else {
      const label = m[3].trim().replace(/\s+/g, ' ');
      out.push({ type: 'link', label, key: noteKey(label) });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

const FENCE = /^\s{0,3}(```|~~~)(.*)$/;
const CALLOUT_OPEN = /^:::([A-Za-z]+)(?:\[([^\]]*)\])?\s*$/;
const CALLOUT_CLOSE = /^:::\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

/** Cells of a table row; `\|` stays inside the cell as a plain bar. */
function splitRow(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && line[i + 1] === '|') {
      cell += '|';
      i++;
    } else if (line[i] === '|') {
      cells.push(cell);
      cell = '';
    } else cell += line[i];
  }
  cells.push(cell);
  if (line.trimStart().startsWith('|')) cells.shift();
  if (cells.length > 0 && /(?<!\\)\|\s*$/.test(line)) cells.pop();
  return cells.map((c) => c.trim());
}

function alignOf(cell: string): TableAlign {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  return left && right ? 'center' : right ? 'right' : left ? 'left' : null;
}

/** Language and `title="…"` from the text after the opening fence. */
function parseFenceInfo(info: string): { lang?: string; title?: string } {
  const title = /\btitle="([^"]*)"/.exec(info)?.[1].trim();
  const lang = /^\s*([^\s"]+)/.exec(info.replace(/\btitle="[^"]*"/, ''))?.[1];
  return {
    ...(lang ? { lang } : {}),
    ...(title ? { title } : {}),
  };
}

/** Index of the line closing the callout opened at `from`, or -1. Fenced code is skipped. */
function findCalloutClose(lines: string[], from: number): number {
  let fence: string | null = null;
  for (let i = from + 1; i < lines.length; i++) {
    const marker = FENCE.exec(lines[i])?.[1];
    if (fence === null && marker) fence = marker;
    else if (fence !== null && marker === fence) fence = null;
    else if (fence === null && CALLOUT_CLOSE.test(lines[i])) return i;
  }
  return -1;
}

function parseBlocks(lines: string[], allowCallouts: boolean): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;
  let code: { marker: string; lines: string[]; lang?: string; title?: string } | null = null;

  const flush = (): void => {
    if (paragraph.length)
      blocks.push({ type: 'paragraph', inline: parseInline(paragraph.join(' ')) });
    if (list) blocks.push({ type: 'list', ...list });
    paragraph = [];
    list = null;
  };
  const closeCode = (c: NonNullable<typeof code>): void => {
    blocks.push({
      type: 'code',
      text: c.lines.join('\n'),
      ...(c.lang ? { lang: c.lang } : {}),
      ...(c.title ? { title: c.title } : {}),
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE.exec(line);
    if (code) {
      if (fence?.[1] === code.marker) {
        closeCode(code);
        code = null;
      } else code.lines.push(line);
      continue;
    }
    if (fence) {
      flush();
      code = { marker: fence[1], lines: [], ...parseFenceInfo(fence[2]) };
      continue;
    }
    const open = allowCallouts ? CALLOUT_OPEN.exec(line) : null;
    const kind = open?.[1].toLowerCase() as CalloutKind | undefined;
    if (open && kind && CALLOUT_KINDS.includes(kind)) {
      const end = findCalloutClose(lines, i);
      if (end !== -1) {
        flush();
        const title = open[2]?.trim();
        blocks.push({
          type: 'callout',
          kind,
          ...(title ? { title } : {}),
          // A callout inside a callout is not supported: its opener stays plain text.
          blocks: parseBlocks(lines.slice(i + 1, end), false),
        });
        i = end;
        continue;
      }
    }
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      lines[i + 1].includes('-') &&
      TABLE_SEPARATOR.test(lines[i + 1])
    ) {
      const header = splitRow(line);
      const separator = splitRow(lines[i + 1]);
      if (header.length === separator.length) {
        flush();
        const rows: Inline[][][] = [];
        let j = i + 2;
        for (; j < lines.length && lines[j].trim() !== '' && lines[j].includes('|'); j++) {
          const cells = splitRow(lines[j]);
          rows.push(header.map((_, col) => parseInline(cells[col] ?? '')));
        }
        blocks.push({
          type: 'table',
          align: separator.map(alignOf),
          header: header.map((c) => parseInline(c)),
          rows,
        });
        i = j - 1;
        continue;
      }
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
  if (code) closeCode(code);
  flush();
  return blocks;
}

/**
 * Minimal Markdown for the reading view: headings, paragraphs, lists, fenced code (with
 * `title="…"`), tables, `:::note|tip|caution` callouts, `code`, **bold** and `[[links]]`.
 * Produces data, never HTML, so nothing is injected.
 */
/** Every inline part of `blocks`, in reading order, including those inside callouts, lists and tables. */
export function inlineParts(blocks: Block[]): Inline[] {
  return blocks.flatMap((block): Inline[] => {
    switch (block.type) {
      case 'heading':
      case 'paragraph':
        return block.inline;
      case 'list':
        return block.items.flat();
      case 'callout':
        return inlineParts(block.blocks);
      case 'table':
        return [...block.header.flat(), ...block.rows.flat(2)];
      default:
        return [];
    }
  });
}

export function parseMarkdown(content: string): Block[] {
  return parseBlocks(content.split(/\r?\n/), true);
}

export interface WikiSection {
  name: string;
  title: string;
  pages: NoteSummary[];
}

export interface WikiTree {
  /** Notes in the root of `wiki/`: shown without a section heading. */
  pages: NoteSummary[];
  sections: WikiSection[];
}

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

/** Ordered items first (by `order`, then name); the rest after them, by name. */
function byOrderThenName<T>(
  items: T[],
  order: (t: T) => number | undefined,
  name: (t: T) => string,
): T[] {
  return [...items].sort((a, b) => {
    const oa = order(a);
    const ob = order(b);
    if (oa !== undefined && ob !== undefined && oa !== ob) return oa - ob;
    if ((oa === undefined) !== (ob === undefined)) return oa === undefined ? 1 : -1;
    return collator.compare(name(a), name(b));
  });
}

/**
 * Builds the sidebar tree: sections and their pages by `order`, then by name. A note whose
 * section is not in `sections` still gets one, titled with the folder name; a section without
 * pages is kept, so a newly created one shows up.
 */
export function buildWikiTree(notes: NoteSummary[], sections: SectionSummary[]): WikiTree {
  const meta = new Map(sections.map((s) => [s.name, s] as const));
  const grouped = new Map<string, NoteSummary[]>();
  const root: NoteSummary[] = [];
  for (const note of notes) {
    if (note.section === undefined) root.push(note);
    else grouped.set(note.section, [...(grouped.get(note.section) ?? []), note]);
  }
  const pageOrder = (pages: NoteSummary[]): NoteSummary[] =>
    byOrderThenName(
      pages,
      (n) => n.order,
      (n) => n.title,
    );
  const known: SectionSummary[] = [
    ...sections,
    ...[...grouped.keys()].filter((name) => !meta.has(name)).map((name) => ({ name, title: name })),
  ];
  return {
    pages: pageOrder(root),
    sections: byOrderThenName(
      known,
      (s) => s.order,
      (s) => s.title,
    ).map((s) => ({
      name: s.name,
      title: s.title,
      pages: pageOrder(grouped.get(s.name) ?? []),
    })),
  };
}

/** An entry of "En esta página": a `##` or `###` heading with a unique id. */
export interface TocEntry {
  id: string;
  level: 2 | 3;
  text: string;
}

type HeadingBlock = Extract<Block, { type: 'heading' }>;

function inlineText(parts: Inline[]): string {
  return parts
    .map((p) => {
      if (p.type === 'link' || p.type === 'file') return p.label;
      return p.type === 'image' ? p.alt : p.text;
    })
    .join('');
}

function headingId(text: string): string {
  const base = text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return base === '' ? 'seccion' : base;
}

/** `##` / `###` headings in document order (callout contents included), code blocks excluded. */
function collectHeadings(blocks: Block[], into: { block: HeadingBlock; entry: TocEntry }[]): void {
  for (const block of blocks) {
    if (block.type === 'callout') collectHeadings(block.blocks, into);
    else if (block.type === 'heading' && (block.level === 2 || block.level === 3)) {
      const text = inlineText(block.inline).trim();
      if (text === '') continue;
      const base = headingId(text);
      const taken = new Set(into.map((h) => h.entry.id));
      let id = base;
      for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
      into.push({ block, entry: { id, level: block.level, text } });
    }
  }
}

/** Ids of the `##` / `###` heading blocks, so the reading view and the index agree. */
export function headingIds(blocks: Block[]): Map<Block, string> {
  const found: { block: HeadingBlock; entry: TocEntry }[] = [];
  collectHeadings(blocks, found);
  return new Map(found.map((h) => [h.block, h.entry.id] as const));
}

/** Index of a page: its `##` and `###` headings in order. `#`, `####`+ and code are left out. */
export function extractToc(content: string): TocEntry[] {
  const found: { block: HeadingBlock; entry: TocEntry }[] = [];
  collectHeadings(parseMarkdown(content), found);
  return found.map((h) => h.entry);
}

export interface PageNavigation {
  previous: NoteSummary | null;
  next: NoteSummary | null;
}

/** Previous / next page in sidebar order (loose pages, then each section), across sections. */
export function pageNavigation(tree: WikiTree, slug: string): PageNavigation {
  const pages = [...tree.pages, ...tree.sections.flatMap((s) => s.pages)];
  const at = pages.findIndex((p) => p.slug === slug);
  if (at === -1) return { previous: null, next: null };
  return { previous: pages[at - 1] ?? null, next: pages[at + 1] ?? null };
}
