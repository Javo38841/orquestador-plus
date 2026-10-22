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
    // Order shown: SUELTA, Empezar, A, B, Guías, C
    (el.querySelectorAll('[role="treeitem"]')[0] as HTMLElement).focus();
    expect(labels()).toEqual(['SUELTA', '▾ Empezar', 'A', 'B', '▾ Guías', 'C']);

    await press('ArrowDown');
    expect(document.activeElement?.textContent).toContain('Empezar');
    await press('ArrowLeft');
    expect(document.activeElement?.getAttribute('aria-expanded')).toBe('false');
    expect(labels()).toEqual(['SUELTA', '▸ Empezar', '▾ Guías', 'C']);
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
});
