import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import {
  localJournalDate,
  type JournalEntry,
  type JournalResult,
} from '../../../../shared/journal';
import type { OrquestadorApi } from '../../../../shared/ipc';
import { DESKTOP_API } from '../../core/desktop-api';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { JournalPage } from './journal-page';

const TODAY = localJournalDate();
const entry = (date: string, text: string): JournalEntry => ({ date, text, updatedAt: '' });

async function render(
  stored: JournalEntry[] = [],
  list: () => Promise<JournalEntry[]> = async () => stored,
) {
  const saveJournalEntry = vi.fn(async (date: string, text: string): Promise<JournalResult> => ({
    ok: true,
    entry: text.trim() ? entry(date, text) : null,
  }));
  const api = { listJournal: vi.fn(list), saveJournalEntry };
  await TestBed.configureTestingModule({
    imports: [
      JournalPage,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
    providers: [{ provide: DESKTOP_API, useValue: api as unknown as OrquestadorApi }],
  }).compileComponents();
  const fixture = TestBed.createComponent(JournalPage);
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  fixture.detectChanges();
  await settle();
  await settle();
  const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const qa = (id: string) => Array.from(el.querySelectorAll(`[data-testid="${id}"]`));
  return { el, q, qa, settle, saveJournalEntry };
}

describe('JournalPage', () => {
  it('keeps what the user typed when the stored entries arrive afterwards', async () => {
    let release!: (entries: JournalEntry[]) => void;
    const { q, settle } = await render(
      [],
      () => new Promise<JournalEntry[]>((resolve) => (release = resolve)),
    );
    const textarea = q('journal-text') as HTMLTextAreaElement;
    textarea.value = 'escrito antes de cargar';
    textarea.dispatchEvent(new Event('input'));
    await settle();
    release([]);
    await settle();
    await settle();
    expect(textarea.value).toBe('escrito antes de cargar');
  });

  it("CP-12-06: shows today's entry ready to edit with the previous days below", async () => {
    const { q, qa } = await render([
      entry(TODAY, 'hoy trabajé'),
      entry('2020-01-02', 'reciente'),
      entry('2020-01-01', 'antigua'),
    ]);
    expect((q('journal-text') as HTMLTextAreaElement).value).toBe('hoy trabajé');
    expect(qa('journal-entry-date').map((e) => e.textContent?.trim())).toEqual([
      '2020-01-02',
      '2020-01-01',
    ]);
  });

  it('CP-12-06: today starts empty when there is no entry for it', async () => {
    const { q, qa } = await render([entry('2020-01-01', 'antigua')]);
    expect((q('journal-text') as HTMLTextAreaElement).value).toBe('');
    expect(qa('journal-entry')).toHaveLength(1);
  });

  it('CP-12-07: with no entries at all it shows the translated empty state', async () => {
    const { q } = await render([]);
    expect(q('journal-empty')?.textContent).toContain('Todavía no hay entradas en la bitácora');
    expect(q('journal-text')).not.toBeNull();
  });

  it("saves today's text through the API with today's date", async () => {
    const { q, settle, saveJournalEntry } = await render([]);
    const area = q('journal-text') as HTMLTextAreaElement;
    area.value = 'nuevo';
    area.dispatchEvent(new Event('input'));
    q('journal-save')!.click();
    await settle();
    expect(saveJournalEntry).toHaveBeenCalledWith(TODAY, 'nuevo');
    expect(q('journal-saved')).not.toBeNull();
    expect(q('journal-empty')).toBeNull();
  });

  it('edits a past day inline', async () => {
    const { q, qa, settle, saveJournalEntry } = await render([entry('2020-01-01', 'viejo')]);
    q('journal-entry-edit')!.click();
    await settle();
    const area = q('journal-entry-text') as HTMLTextAreaElement;
    expect(area.value).toBe('viejo');
    area.value = 'corregido';
    area.dispatchEvent(new Event('input'));
    q('journal-entry-save')!.click();
    await settle();
    expect(saveJournalEntry).toHaveBeenCalledWith('2020-01-01', 'corregido');
    expect(qa('journal-entry-body')[0].textContent).toBe('corregido');
  });
});
