import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type {
  Snippet,
  SnippetInput,
  SnippetResult,
  SnippetsView,
} from '../../../../shared/snippets';
import { DESKTOP_API } from '../../core/desktop-api';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { COPIED_FEEDBACK_MS, SnippetsPage } from './snippets-page';

const snippet = (id: number, extra: Partial<Snippet> = {}): Snippet => ({
  id,
  title: `snippet ${id}`,
  type: 'sql',
  content: 'SELECT 1;',
  tags: [],
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
  ...extra,
});

async function render(stored: Snippet[] = [], view: SnippetsView = 'grid') {
  const api = {
    listSnippets: vi.fn(async () => stored),
    createSnippet: vi.fn(async (input: SnippetInput): Promise<SnippetResult> => ({
      ok: true,
      snippet: snippet(10, { ...input, tags: input.tags ?? [] }),
    })),
    updateSnippet: vi.fn(async (id: number, input: SnippetInput): Promise<SnippetResult> => ({
      ok: true,
      snippet: snippet(id, { ...input, tags: input.tags ?? [] }),
    })),
    deleteSnippet: vi.fn(async () => true),
    copyToClipboard: vi.fn(async () => true),
    getSnippetsView: vi.fn(async () => view),
    setSnippetsView: vi.fn(async (v: SnippetsView) => v),
  };
  await TestBed.configureTestingModule({
    imports: [
      SnippetsPage,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
    providers: [{ provide: DESKTOP_API, useValue: api as unknown as OrquestadorApi }],
  }).compileComponents();
  const fixture = TestBed.createComponent(SnippetsPage);
  const el = fixture.nativeElement as HTMLElement;
  fixture.detectChanges();
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  await settle(); // the saved view arrives after the list
  const q = (testId: string) => el.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
  const click = async (testId: string, index = 0) => {
    (el.querySelectorAll(`[data-testid="${testId}"]`)[index] as HTMLElement).click();
    await settle();
  };
  const type = async (testId: string, value: string, event = 'input') => {
    const field = q(testId) as HTMLInputElement;
    field.value = value;
    field.dispatchEvent(new Event(event));
    await settle();
  };
  const titles = () =>
    [...el.querySelectorAll('[data-testid="snippet-card-title"]')].map((c) =>
      c.textContent?.trim(),
    );
  return { api, el, q, click, type, settle, titles };
}

describe('SnippetsPage', () => {
  it('CP-13-08: with no snippets it shows an empty state with the create action', async () => {
    const { q, click } = await render([]);
    expect(q('snippets-empty')?.textContent).toContain('Todavía no hay snippets');
    expect(q('empty-new-snippet')?.textContent).toContain('Crear el primer snippet');
    await click('empty-new-snippet');
    expect(q('snippet-form')).not.toBeNull();
  });

  it('CP-13-01: lists the snippets with their title, type and content', async () => {
    const { q, titles } = await render([
      snippet(2, { type: 'command', content: 'ls -la' }),
      snippet(1),
    ]);
    expect(titles()).toEqual(['snippet 2', 'snippet 1']);
    expect(q('snippet-type-badge')?.textContent?.trim()).toBe('Comando');
    expect(q('snippet-card-content')?.textContent).toBe('ls -la');
  });

  it('CP-13-01: creating a snippet sends the form to the API and lists it', async () => {
    const { api, q, click, type, titles } = await render([snippet(1)]);
    await click('new-snippet');
    await type('snippet-title', 'Listar');
    await type('snippet-type', 'command', 'change');
    await type('snippet-content', 'ls\n  -la');
    await click('snippet-save');
    expect(api.createSnippet).toHaveBeenCalledWith({
      title: 'Listar',
      type: 'command',
      content: 'ls\n  -la',
      tags: [],
    });
    expect(q('snippet-form')).toBeNull();
    expect(titles()[0]).toBe('Listar');
  });

  it('CP-13-02: an empty title or content shows an error and does not call the API', async () => {
    const { api, q, click, type } = await render([snippet(1)]);
    await click('new-snippet');
    await type('snippet-content', 'x');
    await click('snippet-save');
    expect(q('snippet-error')?.textContent).toContain('título');
    await type('snippet-title', 'a');
    await type('snippet-content', '');
    await click('snippet-save');
    expect(q('snippet-error')?.textContent).toContain('contenido');
    expect(api.createSnippet).not.toHaveBeenCalled();
  });

  it('CP-13-03: editing prefills the form and saves through update', async () => {
    const { api, q, click, type } = await render([snippet(1, { tags: ['db'] })]);
    await click('snippet-edit');
    expect((q('snippet-title') as HTMLInputElement).value).toBe('snippet 1');
    await type('snippet-title', 'otro');
    await click('snippet-save');
    expect(api.updateSnippet).toHaveBeenCalledWith(1, {
      title: 'otro',
      type: 'sql',
      content: 'SELECT 1;',
      tags: ['db'],
    });
  });

  it('CP-13-04: deleting asks for confirmation and then removes the card', async () => {
    const { api, click, titles } = await render([snippet(2), snippet(1)]);
    await click('snippet-delete');
    expect(api.deleteSnippet).not.toHaveBeenCalled();
    await click('snippet-delete-confirm');
    expect(api.deleteSnippet).toHaveBeenCalledWith(2);
    expect(titles()).toEqual(['snippet 1']);
  });

  it('CP-13-05: Copy sends the exact content and shows a brief confirmation', async () => {
    const content = '  SELECT *\n\tFROM t;\n';
    const { api, q, click, settle } = await render([snippet(1, { content })]);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      expect(q('snippet-copied')).toBeNull();
      await click('snippet-copy');
      expect(api.copyToClipboard).toHaveBeenCalledWith(content);
      expect(q('snippet-copied')?.textContent).toContain('Copiado');
      vi.advanceTimersByTime(COPIED_FEEDBACK_MS);
      await settle();
      expect(q('snippet-copied')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('CP-13-06: the type filters list only that type; "Todos" lists all', async () => {
    const { click, titles } = await render([
      snippet(3, { type: 'command' }),
      snippet(2),
      snippet(1, { type: 'command' }),
    ]);
    await click('filter-sql');
    expect(titles()).toEqual(['snippet 2']);
    await click('filter-command');
    expect(titles()).toEqual(['snippet 3', 'snippet 1']);
    await click('filter-all');
    expect(titles()).toHaveLength(3);
  });

  it('CP-13-07: filtering by a tag lists only the snippets with that tag', async () => {
    const { type, titles } = await render([
      snippet(2, { tags: ['db', 'ops'] }),
      snippet(1, { tags: ['web'] }),
    ]);
    await type('filter-tag', 'web', 'change');
    expect(titles()).toEqual(['snippet 1']);
    await type('filter-tag', '', 'change');
    expect(titles()).toHaveLength(2);
  });

  const six = () => [
    snippet(1, { title: 'Usuarios', tags: ['db'] }),
    snippet(2, { title: 'Pedidos', tags: ['db'] }),
    snippet(3, { title: 'Logs', type: 'command', content: 'tail -f app.log', tags: ['ops'] }),
    snippet(4, { title: 'Docker', type: 'command', content: 'docker ps' }),
    snippet(5, { title: 'Conexión', content: 'SELECT version()' }),
    snippet(6, { title: 'Otro' }),
  ];

  it('CP-13-11: opens in the grid with a switch showing the active view', async () => {
    const { q } = await render([snippet(1)]);
    expect(q('snippet-list')?.dataset['view']).toBe('grid');
    expect(q('view-grid')?.getAttribute('aria-pressed')).toBe('true');
    expect(q('view-list')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('CP-13-12: grid cards have two columns with title, badge, code, copy and tags', async () => {
    const { q } = await render([snippet(1, { tags: ['db'] }), snippet(2)]);
    expect(q('snippet-list')?.className).toContain('grid-cols-2');
    const card = q('snippet-card')!;
    expect(card.querySelector('[data-testid="snippet-card-title"]')).not.toBeNull();
    expect(card.querySelector('[data-testid="snippet-type-badge"]')).not.toBeNull();
    expect(card.querySelector('[data-testid="snippet-card-content"]')).not.toBeNull();
    expect(card.querySelector('[data-testid="snippet-copy"]')).not.toBeNull();
    expect(card.querySelector('[data-testid="tag-chip"]')?.textContent).toContain('#db');
  });

  it('CP-13-13: SQL is blue and Comando violet, in the grid and the list', async () => {
    const { q, click, el } = await render([snippet(1), snippet(2, { type: 'command' })]);
    const classes = () =>
      [...el.querySelectorAll('[data-testid="snippet-type-badge"]')].map((b) => b.className);
    const [sql, command] = classes();
    expect(sql).not.toBe(command);
    await click('view-list');
    expect(classes()).toEqual([sql, command]);
    expect(q('snippet-list')).not.toBeNull();
  });

  it('CP-13-14: the list is one column with the same data and actions', async () => {
    const { q, click } = await render([snippet(1), snippet(2)]);
    await click('view-list');
    expect(q('snippet-list')?.dataset['view']).toBe('list');
    expect(q('snippet-list')?.className).not.toContain('grid-cols-2');
    for (const id of ['snippet-card-title', 'snippet-copy', 'snippet-edit', 'snippet-delete']) {
      expect(q(id)).not.toBeNull();
    }
  });

  it('CP-13-15: switching the view saves it, and a reopened page restores it', async () => {
    const { api, click } = await render([snippet(1)]);
    await click('view-list');
    expect(api.setSnippetsView).toHaveBeenCalledWith('list');
    TestBed.resetTestingModule();
    const again = await render([snippet(1)], 'list');
    expect(again.q('snippet-list')?.dataset['view']).toBe('list');
  });

  it('CP-13-17: Copy in the grid sends the exact content, confirms and uses the accent color', async () => {
    const { api, q, click } = await render([snippet(1, { content: ' a\n\tb ' })]);
    expect(q('snippet-copy')?.className).toContain('bg-accent');
    await click('snippet-copy');
    expect(api.copyToClipboard).toHaveBeenCalledWith(' a\n\tb ');
    expect(q('snippet-copied')).not.toBeNull();
  });

  it('CP-13-18: the search box has its hint and filters by title, content or tag', async () => {
    const { q, type, titles } = await render(six());
    expect(q('snippet-search')?.getAttribute('placeholder')).toBe(
      'Buscar por título, texto o etiqueta',
    );
    await type('snippet-search', 'CONEXION');
    expect(titles()).toEqual(['Conexión']);
    await type('snippet-search', 'docker ps');
    expect(titles()).toEqual(['Docker']);
    await type('snippet-search', 'OPS');
    expect(titles()).toEqual(['Logs']);
  });

  it('CP-13-19: no matches shows the empty filter message; blank text lists all', async () => {
    const { el, type, titles } = await render(six());
    await type('snippet-search', 'zzz');
    expect(titles()).toEqual([]);
    expect(el.textContent).toContain('No hay snippets en este filtro');
    await type('snippet-search', '   ');
    expect(titles()).toHaveLength(6);
  });

  it('CP-13-20: the type filters show their counts over all the snippets', async () => {
    const { q } = await render(six());
    const text = (id: string) => q(id)?.textContent?.replace(/\s+/g, ' ').trim();
    expect(text('filter-all')).toBe('Todos · 6');
    expect(text('filter-sql')).toBe('SQL · 4');
    expect(text('filter-command')).toBe('Comandos · 2');
  });

  it('CP-13-21: type, tag and text combine and the counts ignore the search text', async () => {
    const { q, click, type, titles } = await render(six());
    await click('filter-sql');
    await type('filter-tag', 'db', 'change');
    await type('snippet-search', 'pedi');
    expect(titles()).toEqual(['Pedidos']);
    expect(q('filter-all')?.textContent).toContain('Todos · 6');
    expect(q('filter-sql')?.textContent).toContain('SQL · 4');
    await click('filter-command');
    expect(titles()).toEqual([]);
  });

  it('CP-13-22: the counts follow a deletion', async () => {
    const { q, click } = await render(six());
    await click('snippet-delete');
    await click('snippet-delete-confirm');
    expect(q('filter-all')?.textContent).toContain('Todos · 5');
  });
});
