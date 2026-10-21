import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type { Snippet, SnippetInput, SnippetResult } from '../../../../shared/snippets';
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

async function render(stored: Snippet[] = []) {
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
    expect(q('snippet-type-chip')?.textContent?.trim()).toBe('Comando');
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
});
