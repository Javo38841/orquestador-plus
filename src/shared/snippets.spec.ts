import { describe, expect, it } from 'vitest';
import {
  filterSnippets,
  snippetTags,
  validateSnippetInput,
  SNIPPET_TITLE_MAX_LENGTH,
  type Snippet,
} from './snippets';

const snippet = (id: number, type: Snippet['type'], tags: string[] = []): Snippet => ({
  id,
  title: `s${id}`,
  type,
  content: 'x',
  tags,
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
});

describe('validateSnippetInput', () => {
  it('trims the title but keeps the content exactly as typed', () => {
    expect(validateSnippetInput({ title: ' a ', type: 'command', content: '  ls\n\n' })).toEqual({
      ok: true,
      title: 'a',
      type: 'command',
      content: '  ls\n\n',
      tags: [],
    });
  });

  it('rejects empty fields, unknown types and over-long titles', () => {
    const bad = (extra: object) =>
      validateSnippetInput({ title: 't', type: 'sql', content: 'x', ...extra });
    expect(bad({ title: ' ' })).toEqual({ ok: false, error: 'empty_title' });
    expect(bad({ content: '' })).toEqual({ ok: false, error: 'empty_content' });
    expect(bad({ type: 'credential' })).toEqual({ ok: false, error: 'invalid' });
    expect(bad({ title: 'a'.repeat(SNIPPET_TITLE_MAX_LENGTH + 1) })).toEqual({
      ok: false,
      error: 'too_long',
    });
  });
});

describe('filterSnippets', () => {
  const all = [snippet(1, 'sql', ['db']), snippet(2, 'command', ['db', 'ops']), snippet(3, 'sql')];

  it('CP-13-06: filters by type, and "all" lists everything', () => {
    expect(filterSnippets(all, 'sql', null).map((s) => s.id)).toEqual([1, 3]);
    expect(filterSnippets(all, 'command', null).map((s) => s.id)).toEqual([2]);
    expect(filterSnippets(all, 'all', null)).toHaveLength(3);
  });

  it('CP-13-07: filters by tag and combines with the type', () => {
    expect(filterSnippets(all, 'all', 'db').map((s) => s.id)).toEqual([1, 2]);
    expect(filterSnippets(all, 'sql', 'db').map((s) => s.id)).toEqual([1]);
  });

  it('lists the distinct tags alphabetically', () => {
    expect(snippetTags(all)).toEqual(['db', 'ops']);
  });
});
