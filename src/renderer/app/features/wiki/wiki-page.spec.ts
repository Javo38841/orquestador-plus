import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type { Note, NoteResult, NoteSummary, SectionSummary } from '../../../../shared/wiki';
import { DESKTOP_API } from '../../core/desktop-api';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { SearchLauncher } from '../search/search-launcher';
import { WikiMode } from './wiki-mode';
import { WikiPage } from './wiki-page';

const summary = (slug: string) => ({
  slug,
  title: slug,
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
});

const noteA: Note = {
  ...summary('A'),
  content: 'Mira [[B]] y [[Fantasma]]',
  links: [
    { label: 'B', key: 'b', slug: 'B' },
    { label: 'Fantasma', key: 'fantasma', slug: null },
  ],
  backlinks: [summary('C')],
};
const noteB: Note = { ...summary('B'), content: 'hola', links: [], backlinks: [summary('A')] };

interface Fixtures {
  notes?: NoteSummary[];
  sections?: SectionSummary[];
  notesByContent?: Record<string, Note>;
}

async function render(
  createResult: NoteResult = { ok: true, note: noteB },
  fixtures: Fixtures = {},
) {
  const mode = { exit: vi.fn() };
  const api = {
    listSections: vi.fn(async () => fixtures.sections ?? []),
    listNotes: vi.fn(async () => fixtures.notes ?? [summary('A'), summary('B')]),
    getNote: vi.fn(async (slug: string): Promise<NoteResult> => ({
      ok: true,
      note: fixtures.notesByContent?.[slug] ?? (slug === 'A' ? noteA : noteB),
    })),
    createNote: vi.fn(async () => createResult),
    updateNote: vi.fn(async (): Promise<NoteResult> => ({ ok: true, note: noteA })),
    deleteNote: vi.fn(async () => true),
  };
  await TestBed.configureTestingModule({
    imports: [
      WikiPage,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
    providers: [
      { provide: DESKTOP_API, useValue: api as unknown as OrquestadorApi },
      { provide: WikiMode, useValue: mode },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(WikiPage);
  const el = fixture.nativeElement as HTMLElement;
  fixture.detectChanges();
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const click = async (testId: string, index = 0) => {
    (el.querySelectorAll(`[data-testid="${testId}"]`)[index] as HTMLElement).click();
    await settle();
  };
  const type = async (testId: string, value: string) => {
    const field = el.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await settle();
  };
  return { api, el, click, type, settle, fixture, mode };
}

describe('WikiPage', () => {
  it('lists notes and opens one with resolved and pending links and backlinks', async () => {
    const { el, click } = await render();
    expect(el.querySelectorAll('[data-testid="note-item"]')).toHaveLength(2);

    await click('note-item', 0);

    expect(el.querySelector('[data-testid="note-view-title"]')?.textContent).toContain('A');
    expect(el.querySelector('[data-testid="note-link"]')?.textContent).toContain('B');
    expect(el.querySelector('[data-testid="note-link-pending"]')?.textContent).toContain(
      'Fantasma',
    );
    expect(el.querySelector('[data-testid="backlink"]')?.textContent).toContain('C');
  });

  it('CP-08-10: a link in the reading view navigates to the target note', async () => {
    const { el, click } = await render();
    await click('note-item', 0);
    await click('note-link');
    expect(el.querySelector('[data-testid="note-view-title"]')?.textContent).toContain('B');
    expect(el.querySelector('[data-testid="backlink"]')?.textContent).toContain('A');
  });

  it('creates a note from the editor and shows it', async () => {
    const { api, el, click, type } = await render();
    await click('new-note');
    await type('note-title', 'B');
    await type('note-content', 'hola');
    await click('note-save');

    expect(api.createNote).toHaveBeenCalledWith({ title: 'B', content: 'hola' });
    expect(el.querySelector('[data-testid="note-editor"]')).toBeNull();
    expect(el.querySelector('[data-testid="note-view-title"]')?.textContent).toContain('B');
  });

  it('CP-08-06: shows the duplicate error and stays in the editor', async () => {
    const { el, click, type } = await render({ ok: false, error: 'duplicate' });
    await click('new-note');
    await type('note-title', 'A');
    await click('note-save');
    expect(el.querySelector('[data-testid="note-error"]')?.textContent).toContain('Ya existe');
    expect(el.querySelector('[data-testid="note-editor"]')).not.toBeNull();
  });

  it('CP-08-11: Esc with unsaved changes asks before discarding', async () => {
    const { el, click, type, fixture, settle } = await render();
    await click('note-item', 0);
    await click('note-edit');
    await type('note-content', 'cambiado');

    (fixture.nativeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape' }),
    );
    await settle();
    expect(el.querySelector('[data-testid="discard-confirm"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="note-editor"]')).not.toBeNull();

    await click('discard-no');
    expect(el.querySelector('[data-testid="note-editor"]')).not.toBeNull();

    await click('note-cancel');
    await click('discard-yes');
    expect(el.querySelector('[data-testid="note-editor"]')).toBeNull();
    expect(el.querySelector('[data-testid="note-view"]')).not.toBeNull();
  });

  it('CP-08-11: Esc without changes leaves the editor right away', async () => {
    const { el, click, fixture, settle } = await render();
    await click('note-item', 0);
    await click('note-edit');
    (fixture.nativeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape' }),
    );
    await settle();
    expect(el.querySelector('[data-testid="discard-confirm"]')).toBeNull();
    expect(el.querySelector('[data-testid="note-editor"]')).toBeNull();
  });

  it('CP-08-11: picking another note with unsaved changes asks first, then navigates', async () => {
    const { el, click, type } = await render();
    await click('note-item', 0);
    await click('note-edit');
    await type('note-title', 'A renombrada');

    await click('note-item', 1);
    expect(el.querySelector('[data-testid="discard-confirm"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="note-view-title"]')).toBeNull();

    await click('discard-yes');
    expect(el.querySelector('[data-testid="note-view-title"]')?.textContent).toContain('B');
  });

  it('deletes a note after confirming', async () => {
    const { api, el, click } = await render();
    await click('note-item', 0);
    await click('note-delete');
    expect(api.deleteNote).not.toHaveBeenCalled();
    await click('note-delete-confirm');
    expect(api.deleteNote).toHaveBeenCalledWith('A');
    expect(el.querySelector('[data-testid="note-view"]')).toBeNull();
  });

  describe('documentation mode', () => {
    const escape = async (fixture: { nativeElement: HTMLElement }, settle: () => Promise<void>) => {
      document.body.appendChild(fixture.nativeElement);
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
      await settle();
    };

    it('CP-08-28: has its own top bar with the wiki name, search and exit', async () => {
      const { el } = await render();
      expect(el.querySelector('[data-testid="wiki-name"]')?.textContent?.trim()).toBe('Wiki');
      expect(el.querySelector('[data-testid="wiki-search"]')?.textContent?.trim()).toBe(
        'Buscar en la wiki · Ctrl K',
      );
      expect(el.querySelector('[data-testid="wiki-exit"]')?.textContent?.trim()).toBe(
        'Salir de la wiki · Esc',
      );
    });

    it('CP-08-28: "Buscar en la wiki" opens the global search', async () => {
      const { click } = await render();
      expect(TestBed.inject(SearchLauncher).open()).toBe(false);
      await click('wiki-search');
      expect(TestBed.inject(SearchLauncher).open()).toBe(true);
    });

    it('CP-08-27: without notes it shows the empty state from the locale', async () => {
      const { el } = await render(undefined, { notes: [] });
      expect(el.querySelector('[data-testid="wiki-empty"]')?.textContent?.trim()).toBe(
        'Todavía no hay notas.',
      );
      expect(el.querySelector('app-wiki-tree')).toBeNull();
    });

    it('CP-08-27: notes without a section are listed as loose pages', async () => {
      const { el } = await render();
      expect(el.querySelectorAll('[data-testid="note-item"]')).toHaveLength(2);
      expect(el.querySelector('[data-testid="wiki-section-toggle"]')).toBeNull();
    });

    it('CP-08-29: a page opens with breadcrumbs, title, description and content', async () => {
      const note: Note = {
        ...summary('Instalar'),
        section: 'Empezar',
        description: 'Cómo dejar todo listo',
        content: 'Pasos',
        links: [],
        backlinks: [],
      };
      const { el, click } = await render(undefined, {
        notes: [
          { ...summary('Instalar'), section: 'Empezar' },
          { ...summary('Otra'), section: 'Guías' },
        ],
        sections: [
          { name: 'Empezar', title: 'Empezar', order: 1 },
          { name: 'Guías', title: 'Guías', order: 2 },
        ],
        notesByContent: { Instalar: note },
      });
      expect(el.querySelectorAll('[data-testid="wiki-section-toggle"]')).toHaveLength(2);

      await click('note-item', 0);

      expect(el.querySelector('[data-testid="breadcrumb-section"]')?.textContent).toBe('Empezar');
      expect(el.querySelector('[data-testid="breadcrumb-page"]')?.textContent).toBe('Instalar');
      expect(el.querySelector('[data-testid="note-view-title"]')?.textContent?.trim()).toBe(
        'Instalar',
      );
      expect(el.querySelector('[data-testid="note-description"]')?.textContent?.trim()).toBe(
        'Cómo dejar todo listo',
      );
      expect(el.querySelector('[data-testid="note-body"]')?.textContent).toContain('Pasos');
    });

    it('CP-08-30: Esc and the exit button leave the wiki', async () => {
      const { mode, click, fixture, settle } = await render();
      await escape(fixture, settle);
      expect(mode.exit).toHaveBeenCalledTimes(1);

      await click('wiki-exit');
      expect(mode.exit).toHaveBeenCalledTimes(2);
      fixture.nativeElement.remove();
    });

    it('CP-08-30: Esc inside a dialog on top (search, capture) does not leave the wiki', async () => {
      const { mode, fixture, settle } = await render();
      document.body.appendChild(fixture.nativeElement);
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      document.body.appendChild(dialog);
      dialog.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
      await settle();
      expect(mode.exit).not.toHaveBeenCalled();
      dialog.remove();
      fixture.nativeElement.remove();
    });

    it('CP-08-31: leaving with unsaved changes asks first, and keeps editing if declined', async () => {
      const { el, mode, click, type } = await render();
      await click('note-item', 0);
      await click('note-edit');
      await type('note-content', 'cambiado');

      await click('wiki-exit');
      expect(el.querySelector('[data-testid="discard-confirm"]')).not.toBeNull();
      expect(mode.exit).not.toHaveBeenCalled();

      await click('discard-no');
      expect(el.querySelector('[data-testid="note-editor"]')).not.toBeNull();

      await click('wiki-exit');
      await click('discard-yes');
      expect(mode.exit).toHaveBeenCalledTimes(1);
      expect(el.querySelector('[data-testid="note-editor"]')).toBeNull();
    });

    it('CP-08-31: Esc while editing with changes asks before discarding', async () => {
      const { el, mode, click, type, fixture, settle } = await render();
      await click('note-item', 0);
      await click('note-edit');
      await type('note-content', 'cambiado');

      await escape(fixture, settle);
      expect(el.querySelector('[data-testid="discard-confirm"]')).not.toBeNull();
      expect(mode.exit).not.toHaveBeenCalled();
      fixture.nativeElement.remove();
    });
  });
});
