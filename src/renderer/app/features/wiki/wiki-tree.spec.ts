import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { buildWikiTree, type NoteSummary } from '../../../../shared/wiki';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { WikiTreeComponent } from './wiki-tree';

const page = (slug: string, section?: string): NoteSummary => ({
  slug,
  title: slug.toUpperCase(),
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
  ...(section !== undefined && { section }),
});

async function render(notes: NoteSummary[], currentSlug: string | null = null) {
  await TestBed.configureTestingModule({
    imports: [
      WikiTreeComponent,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(WikiTreeComponent);
  const opened: string[] = [];
  fixture.componentInstance.opened.subscribe((slug) => opened.push(slug));
  fixture.componentRef.setInput('tree', buildWikiTree(notes, []));
  fixture.componentRef.setInput('currentSlug', currentSlug);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const press = async (key: string) => {
    (document.activeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
    await settle();
  };
  const labels = () =>
    Array.from(el.querySelectorAll('[role="treeitem"]')).map((e) => e.textContent!.trim());
  return { fixture, el, opened, settle, press, labels };
}

const notes = [page('a', 'Empezar'), page('b', 'Empezar'), page('c', 'Guías'), page('suelta')];

describe('WikiTreeComponent', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('CP-08-26: shows foldable sections and highlights the current page', async () => {
    const { el } = await render(notes, 'b');

    const sections = el.querySelectorAll('[data-testid="wiki-section-toggle"]');
    expect(Array.from(sections).map((s) => s.textContent!.replace(/[▸▾]/, '').trim())).toEqual([
      'Empezar',
      'Guías',
    ]);
    const current = el.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain('B');
  });

  it('CP-08-26: folding or unfolding a section does not change the open page', async () => {
    const { el, opened, settle } = await render(notes, 'b');
    const toggle = el.querySelector('[data-testid="wiki-section-toggle"]') as HTMLElement;

    toggle.click();
    await settle();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelectorAll('[data-testid="note-item"]')).toHaveLength(2); // suelta + Guías/c

    toggle.click();
    await settle();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('[aria-current="page"]')?.textContent).toContain('B');
    expect(opened).toEqual([]);
  });

  it('CP-08-26: clicking a page asks to open it', async () => {
    const { el, opened } = await render(notes);
    (el.querySelectorAll('[data-testid="note-item"]')[2] as HTMLElement).click();
    expect(opened).toEqual(['b']);
  });

  it('CP-08-27: notes without a section show as loose pages, with no section heading', async () => {
    const { el, labels } = await render([page('x'), page('y')]);
    expect(el.querySelector('[data-testid="wiki-section-toggle"]')).toBeNull();
    expect(labels()).toEqual(['X', 'Y']);
  });

  it('CP-08-32: arrows walk the tree, Enter opens a page, ← / → fold a section', async () => {
    const { el, opened, press, labels } = await render(notes);
    // Order shown: SUELTA, Empezar, A, B, Guías, C (the fold arrow sits right of the name)
    (el.querySelectorAll('[role="treeitem"]')[0] as HTMLElement).focus();
    expect(labels()).toEqual(['SUELTA', 'Empezar▾', 'A', 'B', 'Guías▾', 'C']);

    await press('ArrowDown');
    expect(document.activeElement?.textContent).toContain('Empezar');
    await press('ArrowLeft');
    expect(document.activeElement?.getAttribute('aria-expanded')).toBe('false');
    expect(labels()).toEqual(['SUELTA', 'Empezar▸', 'Guías▾', 'C']);
    await press('ArrowRight');
    expect(document.activeElement?.getAttribute('aria-expanded')).toBe('true');
    await press('ArrowRight'); // already open: into its first page
    expect(document.activeElement?.textContent).toContain('A');
    await press('ArrowDown');
    await press('Enter');
    expect(opened).toEqual(['b']);

    await press('ArrowLeft'); // from a page: up to its section
    expect(document.activeElement?.textContent).toContain('Empezar');
    await press('End');
    expect(document.activeElement?.textContent).toContain('C');
    await press('Home');
    expect(document.activeElement?.textContent).toContain('SUELTA');
    await press('Enter');
    expect(opened).toEqual(['b', 'suelta']);
  });

  it('CP-08-32: Enter on a section folds it, and only one row is reachable with Tab', async () => {
    const { el, press } = await render(notes, 'c');
    const stops = el.querySelectorAll('[role="treeitem"][tabindex="0"]');
    expect(stops).toHaveLength(1);
    expect(stops[0].textContent).toContain('C');

    (el.querySelector('[data-testid="wiki-section-toggle"]') as HTMLElement).focus();
    await press('Enter');
    expect(el.querySelectorAll('[data-testid="note-item"]')).toHaveLength(2);
  });

  describe('design (RF-08, #76)', () => {
    const rowOf = (el: HTMLElement, label: string) =>
      Array.from(el.querySelectorAll<HTMLElement>('[data-testid="note-item"]')).find(
        (r) => r.textContent?.trim() === label,
      )!;

    it('CP-08-62: the selected page has the turquoise background and dark text, the others not', async () => {
      const { el } = await render(notes, 'b');
      const selected = rowOf(el, 'B');
      expect(selected.className).toContain('bg-accent');
      expect(selected.className).toContain('text-accent-ink');
      for (const label of ['SUELTA', 'A', 'C']) {
        expect(rowOf(el, label).className, label).not.toContain('bg-accent');
        expect(rowOf(el, label).className, label).not.toContain('text-accent-ink');
      }
    });

    it('CP-08-63: with no page selected, or one that does not exist, no row is highlighted', async () => {
      for (const current of [null, 'no-existe']) {
        TestBed.resetTestingModule();
        const { el } = await render(notes, current);
        const highlighted = el.querySelectorAll('[aria-current="page"], .bg-accent');
        expect(highlighted, String(current)).toHaveLength(0);
      }
      TestBed.resetTestingModule();
      const { el } = await render([], null);
      expect(el.querySelectorAll('[role="treeitem"]')).toHaveLength(0);
    });

    it('CP-08-64: section headings are bold with a fold arrow, and their pages are indented', async () => {
      const { el } = await render(notes);
      for (const heading of el.querySelectorAll<HTMLElement>(
        '[data-testid="wiki-section-toggle"]',
      )) {
        expect(heading.className).toContain('font-semibold');
        expect(heading.className).not.toContain('uppercase');
        expect(heading.querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe('▾');
      }
      const group = el.querySelector('[data-testid="wiki-section"] [role="group"]')!;
      expect(group.className).toContain('pl-3');
      expect(group.textContent).toContain('A');
    });

    it('CP-08-65: clicking the heading folds the section and hides its pages; again shows them', async () => {
      const { el, settle } = await render(notes);
      const heading = el.querySelector<HTMLElement>('[data-testid="wiki-section-toggle"]')!;
      const visible = () =>
        Array.from(el.querySelectorAll('[data-testid="note-item"]')).map((r) =>
          r.textContent?.trim(),
        );

      heading.click();
      await settle();
      expect(visible()).toEqual(['SUELTA', 'C']);
      expect(heading.querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe('▸');

      heading.click();
      await settle();
      expect(visible()).toEqual(['SUELTA', 'A', 'B', 'C']);
    });

    it('CP-08-66: a folded section holding the open page says so and the selection is kept', async () => {
      const { el, settle, fixture, opened } = await render(notes, 'b');
      const [empezar, guias] = Array.from(
        el.querySelectorAll<HTMLElement>('[data-testid="wiki-section-toggle"]'),
      );
      expect(empezar.dataset['containsCurrent']).toBeUndefined();

      empezar.click();
      guias.click();
      await settle();
      expect(empezar.dataset['containsCurrent']).toBe('true');
      expect(empezar.className).toContain('text-accent');
      expect(empezar.getAttribute('title')).toBe('Contiene la página abierta');
      expect(guias.dataset['containsCurrent']).toBeUndefined();
      expect(fixture.componentInstance.currentSlug()).toBe('b');
      expect(opened).toEqual([]);

      empezar.click();
      await settle();
      expect(empezar.dataset['containsCurrent']).toBeUndefined();
      expect(rowOf(el, 'B').getAttribute('aria-current')).toBe('page');
    });

    it('CP-08-71: the "+" form shows the error it gets back and Esc closes it', async () => {
      const { el, fixture, settle } = await render(notes);
      const create = vi.fn(async () => 'wiki.errors.empty');
      fixture.componentRef.setInput('createPage', create);
      await settle();
      el.querySelector<HTMLElement>('[data-testid="wiki-add-page"]')!.click();
      await settle();
      const field = el.querySelector<HTMLInputElement>('[data-testid="new-page-title"]')!;
      expect(document.activeElement).toBe(field);

      el.querySelector<HTMLFormElement>('[data-testid="new-page-form"]')!.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve));
      await settle();
      expect(create).toHaveBeenCalledWith('Empezar', '');
      expect(el.querySelector('[data-testid="new-page-error"]')?.textContent?.trim()).toBe(
        'El título no puede estar vacío',
      );

      field.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
      await settle();
      expect(el.querySelector('[data-testid="new-page-form"]')).toBeNull();
    });
  });
});
