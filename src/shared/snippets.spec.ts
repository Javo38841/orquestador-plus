import { describe, expect, it } from 'vitest';
import {
  countSnippetsByType,
  filterSnippets,
  isSnippetsView,
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

describe('searching snippets', () => {
  const all: Snippet[] = [
    { ...snippet(1, 'sql', ['db']), title: 'Conexión lenta', content: 'SELECT 1' },
    { ...snippet(2, 'command', ['Docker']), title: 'Limpiar', content: 'docker prune' },
  ];

  it('CP-13-18: matches title, content or tag, ignoring case and accents', () => {
    expect(filterSnippets(all, 'all', null, 'CONEXION').map((s) => s.id)).toEqual([1]);
    expect(filterSnippets(all, 'all', null, 'select').map((s) => s.id)).toEqual([1]);
    expect(filterSnippets(all, 'all', null, 'DOCKER').map((s) => s.id)).toEqual([2]);
    expect(filterSnippets(all, 'all', null, 'zzz')).toEqual([]);
  });

  it('CP-13-19: blank text lists everything', () => {
    expect(filterSnippets(all, 'all', null, '   ')).toHaveLength(2);
  });

  it('CP-13-21: type, tag and text combine', () => {
    expect(filterSnippets(all, 'sql', 'db', 'conexion')).toHaveLength(1);
    expect(filterSnippets(all, 'command', 'db', 'conexion')).toHaveLength(0);
  });

  it('CP-13-20: counts snippets per type', () => {
    const six = [1, 2, 3, 4].map((i) => snippet(i, i % 2 ? 'sql' : 'command'));
    expect(countSnippetsByType(six)).toEqual({ all: 4, sql: 2, command: 2 });
  });

  it('CP-13-16: only grid and list are views', () => {
    expect(isSnippetsView('grid') && isSnippetsView('list')).toBe(true);
    expect(isSnippetsView('table')).toBe(false);
  });
});
