import { TestBed } from '@angular/core/testing';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type {
  Snippet,
  SnippetInput,
  SnippetResult,
  SnippetsView,
} from '../../../../shared/snippets';
import { DESKTOP_API } from '../../core/desktop-api';
import { SnippetsStore } from './snippets.store';

const snippet = (id: number, extra: Partial<Snippet> = {}): Snippet => ({
  id,
  title: `s${id}`,
  type: 'sql',
  content: 'SELECT 1;',
  tags: [],
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
  ...extra,
});

const input: SnippetInput = { title: 'Nuevo', type: 'command', content: 'ls', tags: [] };

const saved = { view: 'grid' as SnippetsView };

function setup(stored: Snippet[] = []) {
  const api = {
    listSnippets: vi.fn(async () => stored),
    createSnippet: vi.fn(async (): Promise<SnippetResult> => ({ ok: true, snippet: snippet(99) })),
    updateSnippet: vi.fn(async (id: number): Promise<SnippetResult> => ({
      ok: true,
      snippet: snippet(id, { title: 'editado' }),
    })),
    deleteSnippet: vi.fn(async () => true),
    copyToClipboard: vi.fn(async () => true),
    getSnippetsView: vi.fn(async (): Promise<SnippetsView> => saved.view),
    setSnippetsView: vi.fn(async (view: SnippetsView) => {
      saved.view = view;
      return view;
    }),
  };
  TestBed.configureTestingModule({
    providers: [{ provide: DESKTOP_API, useValue: api as unknown as OrquestadorApi }],
  });
  return { api, store: TestBed.inject(SnippetsStore) };
}

describe('SnippetsStore', () => {
  beforeEach(() => {
    saved.view = 'grid';
  });

  it('CP-13-01: the view is the grid when nothing was saved', async () => {
    const { store } = setup([snippet(1)]);
    await store.load();
    expect(store.view()).toBe('grid');
  });

  it('CP-13-15: the chosen view is saved and a new store restores it', async () => {
    const first = setup([snippet(1)]);
    await first.store.load();
    await first.store.setView('list');
    expect(first.api.setSnippetsView).toHaveBeenCalledWith('list');
    TestBed.resetTestingModule();
    const second = setup([snippet(1)]);
    await second.store.load();
    expect(second.store.view()).toBe('list');
  });

  it('CP-13-20: counts all and per type, and CP-13-22: they follow create, update and delete', async () => {
    const { store } = setup([snippet(1), snippet(2, { type: 'command' })]);
    await store.load();
    expect(store.counts()).toEqual({ all: 2, sql: 1, command: 1 });
    await store.create(input);
    expect(store.counts()).toEqual({ all: 3, sql: 2, command: 1 });
    await store.remove(1);
    expect(store.counts()).toEqual({ all: 2, sql: 1, command: 1 });
  });

  it('CP-13-01: create saves through the API and puts the snippet first', async () => {
    const { api, store } = setup([snippet(1)]);
    await store.load();
    expect(await store.create(input)).toBeNull();
    expect(api.createSnippet).toHaveBeenCalledWith(input);
    expect(store.snippets().map((s) => s.id)).toEqual([99, 1]);
  });

  it('CP-13-02: invalid input is rejected without calling the API', async () => {
    const { api, store } = setup();
    expect(await store.create({ ...input, title: ' ' })).toBe('empty_title');
    expect(await store.create({ ...input, content: '' })).toBe('empty_content');
    expect(await store.update(1, { ...input, type: 'x' as never })).toBe('invalid');
    expect(api.createSnippet).not.toHaveBeenCalled();
    expect(api.updateSnippet).not.toHaveBeenCalled();
  });

  it('CP-13-03: update replaces the snippet in the list', async () => {
    const { store } = setup([snippet(1), snippet(2)]);
    await store.load();
    expect(await store.update(2, input)).toBeNull();
    expect(store.snippets().map((s) => s.title)).toEqual(['s1', 'editado']);
  });

  it('reloads the list when the edited snippet no longer exists', async () => {
    const { api, store } = setup([snippet(1)]);
    await store.load();
    api.updateSnippet.mockResolvedValueOnce({ ok: false, error: 'not_found' });
    api.listSnippets.mockResolvedValueOnce([]);
    expect(await store.update(1, input)).toBe('not_found');
    await vi.waitFor(() => expect(store.snippets()).toEqual([]));
  });

  it('CP-13-04: remove drops the snippet from the list', async () => {
    const { store } = setup([snippet(1), snippet(2)]);
    await store.load();
    await store.remove(1);
    expect(store.snippets().map((s) => s.id)).toEqual([2]);
  });

  it('CP-13-05: copy sends the exact content to the clipboard API', async () => {
    const { api, store } = setup();
    const content = '  SELECT *\n\tFROM t;\n\n';
    expect(await store.copy(snippet(1, { content }))).toBe(true);
    expect(api.copyToClipboard).toHaveBeenCalledWith(content);
  });

  it('CP-13-07: exposes the distinct tags in use', async () => {
    const { store } = setup([snippet(1, { tags: ['db'] }), snippet(2, { tags: ['db', 'ops'] })]);
    await store.load();
    expect(store.tags()).toEqual(['db', 'ops']);
  });
});
