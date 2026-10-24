import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type { SearchResult } from '../../../../shared/search';
import { DESKTOP_API } from '../../core/desktop-api';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { SEARCH_DEBOUNCE_MS, SearchPalette } from './search-palette';

const RESULTS: SearchResult[] = [
  { kind: 'inbox', id: 7, title: 'Captura de informe' },
  { kind: 'task', id: 3, title: 'Informe mensual' },
  { kind: 'task', id: 4, title: 'Informe semanal' },
];

describe('SearchPalette', () => {
  let search: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    search = vi.fn(async () => RESULTS);
    navigate = vi.fn(async () => true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function renderFixture() {
    await TestBed.configureTestingModule({
      imports: [
        SearchPalette,
        TranslocoTestingModule.forRoot({
          langs: TRANSLATIONS,
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
          preloadLangs: true,
        }),
      ],
      providers: [
        { provide: DESKTOP_API, useValue: { search } as unknown as OrquestadorApi },
        { provide: Router, useValue: { navigate } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(SearchPalette);
    fixture.detectChanges();
    return fixture;
  }

  async function render() {
    const fixture = await renderFixture();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('[data-testid="search-input"]')!;

    const type = async (text: string) => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      TestBed.inject(ApplicationRef).tick();
    };
    const press = (key: string) => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      TestBed.inject(ApplicationRef).tick();
    };
    const rows = () =>
      [...el.querySelectorAll('[data-testid="search-result"]')].map((r) => r.textContent?.trim());
    return { el, type, press, rows, closed };
  }

  it('CP-10-09: queries through DESKTOP_API after the debounce and groups results by kind', async () => {
    const { el, type, rows } = await render();

    {
      const field = el.querySelector<HTMLInputElement>('[data-testid="search-input"]')!;
      field.value = 'inf';
      field.dispatchEvent(new Event('input'));
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 10);
      expect(search).not.toHaveBeenCalled();
    }
    await type('informe');

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('informe');
    const headings = [...el.querySelectorAll('h3')].map((h) => h.textContent?.trim());
    expect(headings).toEqual(['Tareas', 'Bandeja de entrada']);
    expect(rows()).toEqual(['Informe mensual', 'Informe semanal', 'Captura de informe']);
  });

  it('CP-10-09: shows the translated empty message when nothing matches', async () => {
    search.mockResolvedValue([]);
    const { el, type } = await render();

    await type('zzz');

    expect(el.querySelector('[data-testid="search-empty"]')?.textContent?.trim()).toBe(
      'Sin resultados',
    );
  });

  it('CP-10-09: a blank query does not call the API nor show the empty message', async () => {
    const { el, type } = await render();

    await type('   ');

    expect(search).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="search-empty"]')).toBeNull();
  });

  it('CP-10-09: ignores an answer that arrives after a newer query', async () => {
    let resolveFirst!: (value: SearchResult[]) => void;
    search
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockImplementationOnce(async () => [RESULTS[2]]);
    const { type, rows } = await render();

    await type('a');
    await type('ab');
    resolveFirst([RESULTS[0]]);
    await vi.advanceTimersByTimeAsync(0);
    TestBed.inject(ApplicationRef).tick();

    expect(rows()).toEqual(['Informe semanal']);
  });

  it('CP-10-10: arrows move the selection and Enter opens the task and closes', async () => {
    const { el, type, press, closed } = await render();
    await type('informe');

    press('ArrowDown');
    const selected = el.querySelector('[aria-selected="true"]');
    expect(selected?.textContent?.trim()).toBe('Informe semanal');
    press('ArrowUp');
    press('ArrowUp'); // wraps to the last one: the inbox item
    press('ArrowDown'); // back to the first
    press('Enter');

    expect(navigate).toHaveBeenCalledWith(['/tasks'], { queryParams: { task: 3 } });
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('CP-10-10: Enter on an inbox result goes to the inbox', async () => {
    const { type, press } = await render();
    await type('informe');

    press('ArrowUp');
    press('Enter');

    expect(navigate).toHaveBeenCalledWith(['/inbox'], { queryParams: undefined });
  });

  it('CP-10-10: Esc closes without navigating', async () => {
    const { type, press, closed } = await render();
    await type('informe');

    press('Escape');

    expect(closed).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('CP-10-10: Enter with no results does nothing', async () => {
    search.mockResolvedValue([]);
    const { type, press, closed } = await render();
    await type('zzz');

    press('Enter');

    expect(navigate).not.toHaveBeenCalled();
    expect(closed).not.toHaveBeenCalled();
  });

  it('CP-N10-06: 100 create and destroy cycles with a pending search leave no timers behind', async () => {
    const live = new Set<unknown>();
    const realSet = globalThis.setTimeout;
    const realClear = globalThis.clearTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      ...args: Parameters<typeof setTimeout>
    ) => {
      const handle = realSet(...args);
      if (args[1] === SEARCH_DEBOUNCE_MS) live.add(handle);
      return handle;
    }) as typeof setTimeout);
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation(((handle: never) => {
      live.delete(handle);
      realClear(handle);
    }) as typeof clearTimeout);
    for (let i = 0; i < 100; i++) {
      TestBed.resetTestingModule();
      const fixture = await renderFixture();
      const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
        '[data-testid="search-input"]',
      )!;
      input.value = 'inf';
      input.dispatchEvent(new Event('input'));
      fixture.destroy();
    }
    expect(live.size).toBe(0);
    vi.restoreAllMocks();
    await vi.runAllTimersAsync();
    expect(search).not.toHaveBeenCalled();
  });

  it('CP-10-21: notes appear in a translated "Notas" group with title, section and snippet', async () => {
    search.mockResolvedValue([
      {
        kind: 'note',
        id: 5,
        title: 'Guía de red',
        slug: 'Guía de red',
        section: 'Operaciones',
        snippet: 'abrir el <b>puerto</b> 443',
      },
    ] satisfies SearchResult[]);
    const { el, type } = await render();

    await type('puerto');

    expect([...el.querySelectorAll('h3')].map((h) => h.textContent?.trim())).toEqual(['Notas']);
    const row = el.querySelector('[data-testid="search-result"]')!;
    expect(row.textContent).toContain('Guía de red');
    expect(row.querySelector('[data-testid="search-result-section"]')?.textContent).toContain(
      'Operaciones',
    );
    const snippet = row.querySelector('[data-testid="search-result-snippet"]')!;
    expect(snippet.textContent).toBe('abrir el <b>puerto</b> 443'); // plain text, not HTML
    expect(snippet.querySelector('b')).toBeNull();
  });

  it('CP-10-21: Enter on a note navigates to it in the wiki and closes the palette', async () => {
    search.mockResolvedValue([
      { kind: 'note', id: 5, title: 'Guía', slug: 'Guía', heading: 'puertos' },
    ] satisfies SearchResult[]);
    const { type, press, closed } = await render();

    await type('puertos');
    press('Enter');

    expect(navigate).toHaveBeenCalledWith(['/wiki'], {
      queryParams: { note: 'Guía', heading: 'puertos' },
    });
    expect(closed).toHaveBeenCalled();
  });
});
