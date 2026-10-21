import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type { Note, NoteResult } from '../../../../shared/wiki';
import { DESKTOP_API } from '../../core/desktop-api';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
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

async function render(createResult: NoteResult = { ok: true, note: noteB }) {
  const api = {
    listNotes: vi.fn(async () => [summary('A'), summary('B')]),
    getNote: vi.fn(async (slug: string): Promise<NoteResult> => ({
      ok: true,
      note: slug === 'A' ? noteA : noteB,
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
    providers: [{ provide: DESKTOP_API, useValue: api as unknown as OrquestadorApi }],
  }).compileComponents();
  const fixture = TestBed.createComponent(WikiPage);
  const el = fixture.nativeElement as HTMLElement;
  fixture.detectChanges();
  await fixture.whenStable();
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
  return { api, el, click, type, settle, fixture };
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
});
