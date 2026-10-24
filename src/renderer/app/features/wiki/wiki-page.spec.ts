import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { AttachmentImageResult, AttachmentResult } from '../../../../shared/attachments';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type {
  Note,
  NoteResult,
  NoteSummary,
  SectionResult,
  SectionSummary,
  SkippedFile,
} from '../../../../shared/wiki';
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
  hash: 'hash-a',
  content: 'Mira [[B]] y [[Fantasma]]',
  links: [
    { label: 'B', key: 'b', slug: 'B' },
    { label: 'Fantasma', key: 'fantasma', slug: null },
  ],
  backlinks: [summary('C')],
};
const noteB: Note = {
  ...summary('B'),
  hash: 'hash-b',
  content: 'hola',
  links: [],
  backlinks: [summary('A')],
};

interface Fixtures {
  notes?: NoteSummary[];
  sections?: SectionSummary[];
  notesByContent?: Record<string, Note>;
  skipped?: SkippedFile[];
  query?: Record<string, string>;
}

async function render(
  createResult: NoteResult = { ok: true, note: noteB },
  fixtures: Fixtures = {},
) {
  const mode = { exit: vi.fn() };
  const changed: (() => void)[] = [];
  const api = {
    listSections: vi.fn(async () => fixtures.sections ?? []),
    createSection: vi.fn(async (): Promise<SectionResult> => ({ ok: false, error: 'io' })),
    listNotes: vi.fn(
      async (): Promise<NoteSummary[]> => fixtures.notes ?? [summary('A'), summary('B')],
    ),
    getNote: vi.fn(async (slug: string): Promise<NoteResult> => ({
      ok: true,
      note: fixtures.notesByContent?.[slug] ?? (slug === 'A' ? noteA : noteB),
    })),
    createNote: vi.fn(async () => createResult),
    updateNote: vi.fn(async (): Promise<NoteResult> => ({ ok: true, note: noteA })),
    deleteNote: vi.fn(async () => true),
    attachFile: vi.fn(async (): Promise<AttachmentResult> => ({
      ok: true,
      link: '![captura](A.assets/captura.png)',
      name: 'captura.png',
    })),
    readAttachment: vi.fn(async (): Promise<AttachmentImageResult> => ({
      ok: true,
      dataUrl: 'data:image/png;base64,AAAA',
    })),
    openAttachment: vi.fn(async () => true),
    listSkippedFiles: vi.fn(async (): Promise<SkippedFile[]> => fixtures.skipped ?? []),
    openWikiFolder: vi.fn(async () => true),
    onWikiChanged: vi.fn((listener: () => void) => {
      changed.push(listener);
      return () => changed.splice(changed.indexOf(listener), 1);
    }),
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
      ...(fixtures.query
        ? [
            {
              provide: ActivatedRoute,
              useValue: { queryParamMap: of(convertToParamMap(fixtures.query)) },
            },
          ]
        : []),
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
  return { api, el, click, type, settle, fixture, mode, changed };
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
      const text = (id: string) => el.querySelector(`[data-testid="${id}"]`)?.textContent?.trim();
      expect(text('wiki-name')).toBe('Wiki de OrquestadorPlus');
      expect(text('wiki-search-label')).toBe('Buscar en la wiki');
      expect(text('wiki-exit-label')).toBe('Salir de la wiki');
    });

    it('CP-08-59: top bar has logo and name left, search centred with Ctrl K, exit with Esc right', async () => {
      const { el } = await render();
      const bar = el.querySelector('[data-testid="wiki-topbar"]')!;
      const [left, middle, right] = Array.from(bar.children) as HTMLElement[];
      expect(bar.children).toHaveLength(3);
      expect(bar.className).toContain('grid-cols-[1fr_minmax(0,28rem)_1fr]');
      expect(left.querySelector('[data-testid="wiki-logo"]')).not.toBeNull();
      expect(left.textContent).toContain('Wiki de OrquestadorPlus');
      expect(middle.dataset['testid']).toBe('wiki-search');
      expect(middle.querySelector('kbd')?.textContent?.trim()).toBe('Ctrl K');
      expect(right.dataset['testid']).toBe('wiki-exit');
      expect(Array.from(right.children).map((c) => c.textContent?.trim())).toEqual([
        '←',
        'Salir de la wiki',
        'Esc',
      ]);
      expect(right.querySelector('kbd')?.textContent?.trim()).toBe('Esc');
      expect(right.className).toContain('justify-self-end');
    });

    it('CP-08-60: clicking the search box opens the search as before', async () => {
      const { click } = await render();
      await click('wiki-search');
      expect(TestBed.inject(SearchLauncher).open()).toBe(true);
    });

    it('CP-08-61: Esc and "Salir de la wiki" still leave the wiki', async () => {
      const { mode, click, fixture, settle } = await render();
      await click('wiki-exit');
      expect(mode.exit).toHaveBeenCalledTimes(1);
      await escape(fixture, settle);
      expect(mode.exit).toHaveBeenCalledTimes(2);
      fixture.nativeElement.remove();
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
        hash: 'h',
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

describe('WikiPage right column and footer', () => {
  const long = (slug: string, content: string, backlinks: NoteSummary[] = []): Note => ({
    ...summary(slug),
    hash: 'h',
    updatedAt: '2026-10-20T15:00:00.000Z',
    content,
    links: [],
    backlinks,
  });
  const body = '## Uno\ntexto\n### Dos\ntexto\n## Tres\ntexto';
  const fixtures = (): Fixtures => ({
    notes: [summary('A'), summary('B'), summary('C')],
    notesByContent: {
      A: long('A', 'sin títulos'),
      B: long('B', body, [summary('A')]),
      C: long('C', 'fin'),
    },
  });
  const text = (el: HTMLElement, id: string, i = 0) =>
    el.querySelectorAll(`[data-testid="${id}"]`)[i]?.textContent?.trim();

  describe('creating sections and pages from the sidebar', () => {
    const withSections = (sections: SectionSummary[], notes: NoteSummary[] = []) => ({
      notes,
      sections,
    });

    it('CP-08-67: "Nueva sección" creates the section and shows it while empty', async () => {
      const { api, el, click, type, settle } = await render(undefined, withSections([]));
      api.createSection.mockImplementation(async () => {
        api.listSections.mockResolvedValue([{ name: 'Guías', title: 'Guías' }]);
        return { ok: true, section: { name: 'Guías', title: 'Guías' } };
      });
      expect(el.querySelector('[data-testid="wiki-empty"]')).not.toBeNull();

      await click('new-section');
      await type('new-section-name', ' Guías ');
      await click('new-section-save');
      await new Promise((resolve) => setTimeout(resolve));
      await settle();

      expect(api.createSection).toHaveBeenCalledWith({ title: 'Guías' });
      const headings = el.querySelectorAll('[data-testid="wiki-section-toggle"]');
      expect(Array.from(headings).map((h) => h.textContent?.replace(/[▸▾]/, '').trim())).toEqual([
        'Guías',
      ]);
      expect(el.querySelector('[data-testid="wiki-empty"]')).toBeNull();
      expect(el.querySelector('[data-testid="new-section-form"]')).toBeNull();
    });

    it('CP-08-68: empty, unsafe or repeated names show a Spanish error and create nothing', async () => {
      const { api, el, click, type, settle } = await render(
        undefined,
        withSections([{ name: 'Guías', title: 'Guías' }]),
      );
      await click('new-section');
      const error = () =>
        el.querySelector('[data-testid="new-section-error"]')?.textContent?.trim();

      for (const [name, message] of [
        ['', 'El nombre de la sección no puede estar vacío'],
        ['   ', 'El nombre de la sección no puede estar vacío'],
        ['a/b', 'El nombre no puede tener / \\ : * ? " < > | ni .. ni empezar con . o _'],
        ['..', 'El nombre no puede tener / \\ : * ? " < > | ni .. ni empezar con . o _'],
        ['guías', 'Ya existe una sección con ese nombre'],
      ]) {
        await type('new-section-name', name);
        await click('new-section-save');
        await new Promise((resolve) => setTimeout(resolve));
        await settle();
        expect(error(), name).toBe(message);
      }
      expect(api.createSection).not.toHaveBeenCalled();
      expect(el.querySelectorAll('[data-testid="wiki-section-toggle"]')).toHaveLength(1);
    });

    it('CP-08-70: the "+" of a section creates a page there, opens it and lists it under it', async () => {
      const created: Note = {
        ...summary('Instalación'),
        section: 'Guías',
        hash: 'h',
        content: '',
        links: [],
        backlinks: [],
      };
      const { api, el, click, type, settle } = await render(
        { ok: true, note: created },
        withSections([{ name: 'Guías', title: 'Guías' }]),
      );
      api.createNote.mockImplementation(async () => {
        api.listNotes.mockResolvedValue([{ ...summary('Instalación'), section: 'Guías' }]);
        return { ok: true, note: created };
      });

      await click('wiki-add-page');
      await type('new-page-title', 'Instalación');
      (el.querySelector('[data-testid="new-page-form"]') as HTMLFormElement).requestSubmit();
      await new Promise((resolve) => setTimeout(resolve));
      await settle();

      expect(api.createNote).toHaveBeenCalledWith({
        title: 'Instalación',
        content: '',
        section: 'Guías',
      });
      expect(el.querySelector('[data-testid="note-view-title"]')?.textContent?.trim()).toBe(
        'Instalación',
      );
      const group = el.querySelector('[data-testid="wiki-section"] [role="group"]')!;
      expect(group.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('Instalación');
      expect(el.querySelector('[data-testid="new-page-form"]')).toBeNull();
    });

    it('CP-08-71: an empty or repeated page title shows a Spanish error and creates nothing', async () => {
      const { api, el, click, type, settle } = await render(
        { ok: false, error: 'duplicate' },
        withSections([{ name: 'Guías', title: 'Guías' }], [{ ...summary('A'), section: 'Guías' }]),
      );
      const submit = async () => {
        (el.querySelector('[data-testid="new-page-form"]') as HTMLFormElement).requestSubmit();
        await new Promise((resolve) => setTimeout(resolve));
        await settle();
      };
      const error = () => el.querySelector('[data-testid="new-page-error"]')?.textContent?.trim();
      await click('wiki-add-page');

      await type('new-page-title', '   ');
      await submit();
      expect(error()).toBe('El título no puede estar vacío');
      expect(api.createNote).not.toHaveBeenCalled();

      await type('new-page-title', 'A');
      await submit();
      expect(error()).toBe('Ya existe una nota con ese título o nombre de archivo');
      expect(el.querySelectorAll('[data-testid="note-item"]')).toHaveLength(1);
      expect(el.querySelector('[data-testid="note-view"]')).toBeNull();
    });

    it('CP-08-73: sidebar and content scroll in their own dark areas', async () => {
      const { el } = await render();
      const sidebar = el.querySelector('nav[aria-label="Secciones de la wiki"]')!;
      const content = el.querySelector('[data-testid="wiki-scroll"]')!;
      for (const area of [sidebar, content]) {
        expect(area.className).toContain('overflow-y-auto');
        expect(area.className).not.toMatch(/scrollbar-(light|white)/);
      }
    });
  });

  it('CP-08-37: shows the index, backlinks, edit button, long date and neighbours', async () => {
    const { el, click } = await render(undefined, fixtures());
    await click('note-item', 1);

    expect(text(el, 'toc')).toContain('En esta página');
    expect(el.querySelectorAll('[data-testid="toc-item"]')).toHaveLength(3);
    expect(text(el, 'backlinks')).toContain('Enlaces entrantes');
    expect(text(el, 'backlink')).toBe('A');
    expect(text(el, 'page-edit')).toBe('Editar página');
    expect(text(el, 'page-updated')).toBe('Última actualización: 20 de octubre de 2026');
    expect(text(el, 'page-prev')).toContain('Anterior');
    expect(text(el, 'page-next')).toContain('Siguiente');
  });

  it('CP-08-38: a page without headings or backlinks shows empty states', async () => {
    const { el, click } = await render(undefined, fixtures());
    await click('note-item', 0);

    expect(el.querySelector('[data-testid="toc-empty"]')).not.toBeNull();
    expect(el.querySelectorAll('[data-testid="toc-item"]')).toHaveLength(0);
    expect(text(el, 'backlinks')).toContain('Ninguna nota enlaza a esta.');
  });

  it('CP-08-36: the first page has no previous and the last has no next', async () => {
    const { el, click } = await render(undefined, fixtures());
    await click('note-item', 0);
    expect(el.querySelector('[data-testid="page-prev"]')).toBeNull();
    expect(el.querySelector('[data-testid="page-next"]')).not.toBeNull();

    await click('note-item', 2);
    expect(el.querySelector('[data-testid="page-next"]')).toBeNull();
    expect(el.querySelector('[data-testid="page-prev"]')).not.toBeNull();
  });

  it('CP-08-39: pressing an index entry scrolls to its heading and highlights it', async () => {
    const { el, click } = await render(undefined, fixtures());
    await click('note-item', 1);
    const heading = el.querySelector<HTMLElement>('[data-heading-id="tres"]')!;
    heading.scrollIntoView = vi.fn();

    await click('toc-item', 2);

    expect(heading.scrollIntoView).toHaveBeenCalled();
    const current = el.querySelectorAll('[data-testid="toc-item"][aria-current="location"]');
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute('data-toc-id')).toBe('tres');
  });

  it('CP-08-40: scrolling highlights only the heading that is currently visible', async () => {
    const { el, click, settle } = await render(undefined, fixtures());
    await click('note-item', 1);
    const scroller = el.querySelector<HTMLElement>('[data-testid="wiki-scroll"]')!;
    const tops: Record<string, number> = { uno: -300, dos: 10, tres: 400 };
    scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    for (const [id, top] of Object.entries(tops)) {
      el.querySelector<HTMLElement>(`[data-heading-id="${id}"]`)!.getBoundingClientRect = () =>
        ({ top }) as DOMRect;
    }

    scroller.dispatchEvent(new Event('scroll'));
    await settle();

    const current = el.querySelectorAll('[data-testid="toc-item"][aria-current="location"]');
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute('data-toc-id')).toBe('dos');
  });

  it('CP-08-41: backlinks, previous and next open the page in wiki mode', async () => {
    const { el, click } = await render(undefined, fixtures());
    await click('note-item', 1);

    await click('backlink');
    expect(text(el, 'note-view-title')).toBe('A');

    await click('page-next');
    expect(text(el, 'note-view-title')).toBe('B');
    await click('page-prev');
    expect(text(el, 'note-view-title')).toBe('A');
  });

  it('CP-08-42: "Editar página" opens the editor with the page', async () => {
    const { el, click } = await render(undefined, fixtures());
    await click('note-item', 1);
    await click('page-edit');
    expect(el.querySelector('[data-testid="note-editor"]')).not.toBeNull();
    expect((el.querySelector('[data-testid="note-content"]') as HTMLTextAreaElement).value).toBe(
      body,
    );
  });

  it('CP-08-43: index entries, backlinks, edit and neighbours are native buttons reachable by Tab', async () => {
    const { el, click } = await render(undefined, fixtures());
    await click('note-item', 1);
    const ids = ['toc-item', 'backlink', 'page-edit', 'page-prev', 'page-next'];
    for (const id of ids) {
      const control = el.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
      expect(control.tagName).toBe('BUTTON');
      expect(control.getAttribute('tabindex')).toBeNull();
      expect(control.className).toContain('focus-visible:ring');
    }
  });
});

describe('WikiPage and changes made outside the app', () => {
  const edited: Note = { ...noteA, hash: 'hash-a2', content: 'Contenido nuevo' };

  it('CP-08-106: refreshes the sidebar and reloads the open page when its file changed', async () => {
    const { api, el, click, changed, settle } = await render();
    await click('note-item', 0);
    expect(changed).toHaveLength(1);

    api.listNotes.mockResolvedValue([summary('A'), summary('B'), summary('Nueva')]);
    api.getNote.mockResolvedValue({ ok: true, note: edited });
    changed[0]();
    await new Promise((r) => setTimeout(r));
    await settle();

    expect(el.querySelectorAll('[data-testid="note-item"]')).toHaveLength(3);
    expect(el.querySelector('[data-testid="note-view"]')?.textContent).toContain('Contenido nuevo');
  });

  it('CP-08-107: a deleted open page says in Spanish that it no longer exists', async () => {
    const { api, el, click, changed, settle } = await render();
    await click('note-item', 0);

    api.listNotes.mockResolvedValue([summary('B')]);
    api.getNote.mockResolvedValue({ ok: false, error: 'not_found' });
    changed[0]();
    await new Promise((r) => setTimeout(r));
    await settle();

    expect(el.querySelector('[data-testid="note-gone"]')?.textContent).toContain('ya no existe');
    expect(el.querySelector('[data-testid="note-view"]')).toBeNull();
    expect(el.querySelectorAll('[data-testid="note-item"]')).toHaveLength(1);
  });

  it('CP-08-108: a save over a changed file asks, and "Quedarme con mi versión" overwrites', async () => {
    const { api, el, click, type, settle } = await render();
    await click('note-item', 0);
    await click('note-edit');
    await type('note-content', 'mi edición');
    api.updateNote.mockResolvedValueOnce({ ok: false, error: 'conflict' });

    await click('note-save');

    expect(api.updateNote).toHaveBeenCalledWith(
      'A',
      expect.objectContaining({ expectedHash: 'hash-a' }),
    );
    expect(el.querySelector('[data-testid="save-conflict"]')?.textContent).toContain(
      'Quedarme con mi versión',
    );
    expect(el.querySelector('[data-testid="note-editor"]')).not.toBeNull();

    await click('conflict-keep-mine');
    await settle();

    expect(api.updateNote).toHaveBeenLastCalledWith(
      'A',
      expect.objectContaining({ overwrite: true, content: 'mi edición' }),
    );
    expect(el.querySelector('[data-testid="note-editor"]')).toBeNull();
  });

  it('CP-08-108: "Recargar la del disco" discards my edit and shows the file', async () => {
    const { api, el, click, type, settle } = await render();
    await click('note-item', 0);
    await click('note-edit');
    await type('note-content', 'mi edición');
    api.updateNote.mockResolvedValueOnce({ ok: false, error: 'conflict' });
    await click('note-save');

    api.getNote.mockResolvedValue({ ok: true, note: edited });
    await click('conflict-reload');
    await new Promise((r) => setTimeout(r));
    await settle();

    expect(el.querySelector('[data-testid="note-editor"]')).toBeNull();
    expect(el.querySelector('[data-testid="note-view"]')?.textContent).toContain('Contenido nuevo');
    expect(api.updateNote).toHaveBeenCalledTimes(1);
  });

  it('CP-08-109: a file deleted while I edit does not close the editor and the save is a conflict', async () => {
    const { api, el, click, type, changed, settle } = await render();
    await click('note-item', 0);
    await click('note-edit');
    await type('note-content', 'mi edición');

    api.getNote.mockResolvedValue({ ok: false, error: 'not_found' });
    changed[0]();
    await new Promise((r) => setTimeout(r));
    await settle();
    expect(el.querySelector('[data-testid="note-editor"]')).not.toBeNull();
    expect((el.querySelector('[data-testid="note-content"]') as HTMLTextAreaElement).value).toBe(
      'mi edición',
    );

    api.updateNote.mockResolvedValueOnce({ ok: false, error: 'conflict' });
    await click('note-save');
    expect(el.querySelector('[data-testid="save-conflict"]')).not.toBeNull();
  });

  it('CP-08-110: shows a Spanish notice for skipped files that opens the list with the reason', async () => {
    const { el, click } = await render(undefined, {
      skipped: [
        { file: 'Guías/Dup.md', reason: 'duplicate' },
        { file: 'mal:nombre.md', reason: 'invalid_name' },
      ],
    });

    expect(el.querySelector('[data-testid="skipped-toggle"]')?.textContent).toContain(
      '2 archivos omitidos',
    );
    expect(el.querySelector('[data-testid="skipped-list"]')).toBeNull();

    await click('skipped-toggle');

    const items = Array.from(el.querySelectorAll('[data-testid="skipped-item"]')).map(
      (i) => i.textContent,
    );
    expect(items[0]).toContain('Guías/Dup.md');
    expect(items[0]).toContain('duplicado');
    expect(items[1]).toContain('Nombre de archivo no válido');
  });

  it('CP-08-110: no notice when nothing was skipped', async () => {
    const { el } = await render();
    expect(el.querySelector('[data-testid="skipped-notice"]')).toBeNull();
  });

  it('CP-08-111: "Abrir carpeta de la wiki" asks main to open it', async () => {
    const { api, el, click } = await render();
    expect(el.querySelector('[data-testid="open-folder"]')?.textContent).toContain(
      'Abrir carpeta de la wiki',
    );
    await click('open-folder');
    expect(api.openWikiFolder).toHaveBeenCalledTimes(1);
  });

  it('CP-08-112: stops listening when the page is destroyed', async () => {
    const { changed, fixture } = await render();
    expect(changed).toHaveLength(1);
    fixture.destroy();
    expect(changed).toHaveLength(0);
  });
});

describe('WikiPage arriving from the global search', () => {
  const withHeadings: Note = {
    ...summary('Guia'),
    hash: 'h',
    content: 'Intro\n\n## Uno\n\ntexto\n\n## Dos\n\notro',
    links: [],
    backlinks: [],
  };
  const fixture = (query: Record<string, string>) => ({
    notes: [summary('Guia')],
    notesByContent: { Guia: withHeadings },
    query,
  });
  const later = () => new Promise((resolve) => setTimeout(resolve, 5));

  it('CP-10-22: opens the note and scrolls to the matching heading', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { el, api, settle } = await render(undefined, fixture({ note: 'Guia', heading: 'dos' }));
    await later();
    await settle();

    expect(api.getNote).toHaveBeenCalledWith('Guia');
    expect(el.querySelector('[data-testid="note-view-title"]')?.textContent).toContain('Guia');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(
      el
        .querySelector('[data-testid="toc-item"][aria-current="location"]')
        ?.getAttribute('data-toc-id'),
    ).toBe('dos');
  });

  it('CP-10-22: without a heading the note opens from the top', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { el, settle } = await render(undefined, fixture({ note: 'Guia' }));
    await later();
    await settle();

    expect(el.querySelector('[data-testid="note-view-title"]')?.textContent).toContain('Guia');
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(el.querySelector<HTMLElement>('[data-testid="wiki-scroll"]')?.scrollTop).toBe(0);
  });
});

describe('WikiPage attachments', () => {
  const withAttachments: Note = { ...noteA, attachments: 2 };
  const file = (name: string, bytes = 3) =>
    ({ name, size: bytes, arrayBuffer: async () => new ArrayBuffer(bytes) }) as unknown as File;

  const startEditing = async (r: Awaited<ReturnType<typeof render>>) => {
    await r.click('note-item', 0);
    await r.click('note-edit');
    const field = r.el.querySelector('[data-testid="note-content"]') as HTMLTextAreaElement;
    return field;
  };
  const content = (field: HTMLTextAreaElement) => field.value;

  it('CP-08-122: pasting an image from the clipboard attaches it and inserts the link at the cursor', async () => {
    const r = await render();
    const field = await startEditing(r);
    field.setSelectionRange(5, 5);
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { files: [file('image.png')] } });

    field.dispatchEvent(paste);
    await r.settle();
    await new Promise((resolve) => setTimeout(resolve));
    await r.settle();

    expect(paste.defaultPrevented).toBe(true);
    expect(r.api.attachFile).toHaveBeenCalledWith({
      slug: 'A',
      name: 'image.png',
      data: expect.any(Uint8Array),
    });
    expect(content(field)).toBe('Mira ![captura](A.assets/captura.png)[[B]] y [[Fantasma]]');
  });

  it('CP-08-122: pasting plain text is left alone', async () => {
    const r = await render();
    const field = await startEditing(r);
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { files: [] } });

    field.dispatchEvent(paste);

    expect(paste.defaultPrevented).toBe(false);
    expect(r.api.attachFile).not.toHaveBeenCalled();
  });

  it('CP-08-122: dropping a file attaches it and inserts the link', async () => {
    const r = await render();
    const field = await startEditing(r);
    field.setSelectionRange(0, 0);
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { files: [file('manual.pdf')], types: ['Files'] },
    });

    field.dispatchEvent(drop);
    await r.settle();
    await new Promise((resolve) => setTimeout(resolve));
    await r.settle();

    expect(drop.defaultPrevented).toBe(true);
    expect(r.api.attachFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'manual.pdf' }));
    expect(content(field).startsWith('![captura](A.assets/captura.png)Mira')).toBe(true);
  });

  it('CP-08-122: the "Adjuntar" button picks files and inserts the link', async () => {
    const r = await render();
    const field = await startEditing(r);
    field.setSelectionRange(0, 0);
    const input = r.el.querySelector('[data-testid="note-attach-input"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file('captura.png')], configurable: true });

    input.dispatchEvent(new Event('change'));
    await r.settle();
    await new Promise((resolve) => setTimeout(resolve));
    await r.settle();

    expect(r.api.attachFile).toHaveBeenCalledTimes(1);
    expect(content(field)).toContain('![captura](A.assets/captura.png)');
    expect(r.el.querySelector('[data-testid="note-attach"]')?.textContent).toContain('Adjuntar');
  });

  it('CP-08-120: a file over the limit is refused in Spanish before it reaches main', async () => {
    const r = await render();
    const field = await startEditing(r);
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { files: [file('grande.png', 10 * 1024 * 1024 + 1)], types: ['Files'] },
    });

    field.dispatchEvent(drop);
    await r.settle();

    expect(r.api.attachFile).not.toHaveBeenCalled();
    expect(r.el.querySelector('[data-testid="attach-error"]')?.textContent).toContain('10 MB');
    expect(content(field)).toBe('Mira [[B]] y [[Fantasma]]');
  });

  it('shows the error main returns and inserts nothing', async () => {
    const r = await render();
    const field = await startEditing(r);
    r.api.attachFile.mockResolvedValueOnce({ ok: false, error: 'too_large' });
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { files: [file('a.png')], types: ['Files'] },
    });

    field.dispatchEvent(drop);
    await r.settle();

    expect(r.el.querySelector('[data-testid="attach-error"]')?.textContent).toContain('10 MB');
    expect(content(field)).toBe('Mira [[B]] y [[Fantasma]]');
  });

  it('a new, unsaved note cannot take attachments yet', async () => {
    const r = await render();
    await r.click('new-note');
    const button = r.el.querySelector('[data-testid="note-attach"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const field = r.el.querySelector('[data-testid="note-content"]') as HTMLTextAreaElement;
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { files: [file('a.png')], types: ['Files'] },
    });

    field.dispatchEvent(drop);
    await r.settle();

    expect(r.api.attachFile).not.toHaveBeenCalled();
    expect(r.el.querySelector('[data-testid="attach-error"]')?.textContent).toContain(
      'Guarda la nota',
    );
  });

  it('CP-08-128: deleting a note with attachments asks whether to delete them; "yes" deletes them', async () => {
    const r = await render({ ok: true, note: noteB }, { notesByContent: { A: withAttachments } });
    await r.click('note-item', 0);
    await r.click('note-delete');
    await r.click('note-delete-confirm');

    expect(r.api.deleteNote).not.toHaveBeenCalled();
    expect(r.el.querySelector('[data-testid="attachments-ask"]')?.textContent).toContain(
      'adjuntos',
    );

    await r.click('attachments-delete-yes');
    expect(r.api.deleteNote).toHaveBeenCalledWith('A', true);
    expect(r.el.querySelector('[data-testid="note-view"]')).toBeNull();
  });

  it('CP-08-128: answering "no" deletes the note and keeps the attachments', async () => {
    const r = await render({ ok: true, note: noteB }, { notesByContent: { A: withAttachments } });
    await r.click('note-item', 0);
    await r.click('note-delete');
    await r.click('note-delete-confirm');

    await r.click('attachments-delete-no');

    expect(r.api.deleteNote).toHaveBeenCalledWith('A');
  });

  it('CP-08-129: deleting a note without attachments does not ask about them', async () => {
    const r = await render();
    await r.click('note-item', 0);
    await r.click('note-delete');
    await r.click('note-delete-confirm');

    expect(r.el.querySelector('[data-testid="attachments-ask"]')).toBeNull();
    expect(r.api.deleteNote).toHaveBeenCalledWith('A');
  });
});

describe('WikiPage with nested folders (#89)', () => {
  const at = (slug: string, title: string, section?: string): NoteSummary => ({
    ...summary(slug),
    title,
    ...(section !== undefined && { section }),
  });
  const notes = [
    at('P/Q/adr', 'ADR-001', 'P/Q'),
    at('P/Q/adr2', 'ADR-002', 'P/Q'),
    at('P/leeme', 'Léeme', 'P'),
    at('Z/fin', 'Fin', 'Z'),
  ];
  const sections: SectionSummary[] = [
    { name: 'P', title: 'Proyectos' },
    { name: 'P/Q', title: 'OrquestadorPlus' },
    { name: 'Z', title: 'Zeta' },
  ];
  const full = (n: NoteSummary): Note => ({
    ...n,
    hash: `h-${n.slug}`,
    content: 'x',
    links: [],
    backlinks: [],
  });
  const fixtures: Fixtures = {
    notes,
    sections,
    notesByContent: Object.fromEntries(notes.map((n) => [n.slug, full(n)])),
  };

  it('CP-08-80: the breadcrumbs show the title of every folder and then the page', async () => {
    const { el, click } = await render(undefined, fixtures);
    const row = Array.from(el.querySelectorAll('[data-testid="note-item"]')).findIndex(
      (r) => r.textContent?.trim() === 'ADR-001',
    );

    await click('note-item', row);

    const texts = (id: string) =>
      Array.from(el.querySelectorAll(`[data-testid="${id}"]`)).map((e) => e.textContent?.trim());
    expect(texts('breadcrumb-section')).toEqual(['Proyectos', 'OrquestadorPlus']);
    expect(texts('breadcrumb-page')).toEqual(['ADR-001']);
  });

  it('CP-08-84: Anterior / Siguiente follow the tree order, folder by folder, depth first', async () => {
    const { el, click, api } = await render(undefined, fixtures);
    const open = async (title: string) => {
      const items = Array.from(el.querySelectorAll('[data-testid="note-item"]'));
      await click(
        'note-item',
        items.findIndex((r) => r.textContent?.trim() === title),
      );
    };

    await open('Léeme'); // pages of P first, then its folder Q
    const footer = () => el.querySelector('[data-testid="page-footer"]')?.textContent;
    expect(footer()).toContain('ADR-001');
    await click('page-next');
    expect(el.querySelector('[data-testid="note-view-title"]')?.textContent?.trim()).toBe(
      'ADR-001',
    );
    await click('page-next');
    await click('page-next');
    expect(el.querySelector('[data-testid="note-view-title"]')?.textContent?.trim()).toBe('Fin');
    expect(api.getNote).toHaveBeenLastCalledWith('Z/fin');
    expect(el.querySelector('[data-testid="page-next"]')).toBeNull();
    await click('page-prev');
    expect(el.querySelector('[data-testid="note-view-title"]')?.textContent?.trim()).toBe(
      'ADR-002',
    );
  });

  it('CP-08-81: the "new section inside" button of a section calls createSection with its path', async () => {
    const { api, el, click, type } = await render(undefined, fixtures);
    api.createSection.mockResolvedValue({
      ok: true,
      section: { name: 'P/Q/Nueva', title: 'Nueva' },
    });

    await click('wiki-add-subsection', 1); // OrquestadorPlus
    await type('new-subsection-name', 'Nueva');
    (el.querySelector('[data-testid="new-subsection-form"]') as HTMLFormElement).requestSubmit();
    await new Promise((resolve) => setTimeout(resolve));

    expect(api.createSection).toHaveBeenCalledWith({ title: 'Nueva', parent: 'P/Q' });
  });

  it('CP-08-82: the "+" of a nested section creates the page in that folder and opens it', async () => {
    const created = full(at('P/Q/Nueva', 'Nueva', 'P/Q'));
    const { api, el, click, type, settle } = await render({ ok: true, note: created }, fixtures);

    await click('wiki-add-page', 1);
    await type('new-page-title', 'Nueva');
    (el.querySelector('[data-testid="new-page-form"]') as HTMLFormElement).requestSubmit();
    await new Promise((resolve) => setTimeout(resolve));
    await settle();

    expect(api.createNote).toHaveBeenCalledWith({
      title: 'Nueva',
      content: '',
      section: 'P/Q',
    });
    expect(el.querySelector('[data-testid="note-view-title"]')?.textContent?.trim()).toBe('Nueva');
  });

  it('CP-08-83: a repeated section name in the same folder shows a Spanish error and creates nothing', async () => {
    const { api, el, click, type, settle } = await render(undefined, {
      ...fixtures,
      sections: [...sections, { name: 'P/Q/Hija', title: 'Hija' }],
    });
    await click('wiki-add-subsection', 1);
    await type('new-subsection-name', 'hija');
    (el.querySelector('[data-testid="new-subsection-form"]') as HTMLFormElement).requestSubmit();
    await new Promise((resolve) => setTimeout(resolve));
    await settle();

    expect(api.createSection).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="new-page-error"]')?.textContent?.trim()).toBe(
      'Ya existe una sección con ese nombre',
    );
  });

  it('CP-08-87: folders deeper than the limit are announced in Spanish with their path', async () => {
    const { el, click } = await render(undefined, {
      ...fixtures,
      skipped: [{ file: 'a/b/c/d/e/f', reason: 'too_deep' }],
    });

    await click('skipped-toggle');

    const item = el.querySelector('[data-testid="skipped-item"]')!.textContent!;
    expect(item).toContain('a/b/c/d/e/f');
    expect(item).toContain('Carpeta demasiado profunda');
  });
});
