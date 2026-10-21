import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { Bug, BugInput, BugResult } from '../../../../shared/bugs';
import type { OrquestadorApi } from '../../../../shared/ipc';
import { DESKTOP_API } from '../../core/desktop-api';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { BugsPage } from './bugs-page';

const bug = (id: number, status: Bug['status'], extra: Partial<Bug> = {}): Bug => ({
  id,
  code: `BUG-${id}`,
  title: `bug ${id}`,
  symptom: 'síntoma',
  impact: '',
  rootCause: '',
  solution: '',
  severity: 'medium',
  status,
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
  ...extra,
});

async function render(stored: Bug[] = []) {
  const api = {
    listBugs: vi.fn(async () => stored),
    createBug: vi.fn(async (input: BugInput): Promise<BugResult> => ({
      ok: true,
      bug: bug(10, 'new', { ...input }),
    })),
    updateBug: vi.fn(async (id: number, input: BugInput): Promise<BugResult> => ({
      ok: true,
      bug: bug(id, 'new', { ...input }),
    })),
    setBugStatus: vi.fn(async (id: number, status: Bug['status']): Promise<BugResult> => ({
      ok: true,
      bug: bug(id, status),
    })),
    deleteBug: vi.fn(async () => true),
  };
  await TestBed.configureTestingModule({
    imports: [
      BugsPage,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
    providers: [{ provide: DESKTOP_API, useValue: api as unknown as OrquestadorApi }],
  }).compileComponents();
  const fixture = TestBed.createComponent(BugsPage);
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
  const type = async (testId: string, value: string) => {
    const field = q(testId) as HTMLInputElement;
    field.value = value;
    field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input'));
    await settle();
  };
  const codes = () =>
    [...el.querySelectorAll('[data-testid="bug-code"]')].map((c) => c.textContent?.trim());
  return { api, el, q, click, type, settle, codes };
}

describe('BugsPage', () => {
  it('CP-09-12: with no bugs it shows an empty state with the "Nuevo bug" action', async () => {
    const { q, click } = await render([]);
    expect(q('bugs-empty')?.textContent).toContain('Todavía no hay bugs');
    expect(q('empty-new-bug')?.textContent).toContain('Nuevo bug');

    await click('empty-new-bug');
    expect(q('bug-form')).not.toBeNull();
  });

  it('CP-09-01: saving a new bug shows it with its code and status "Nuevo"', async () => {
    const { api, q, click, type, codes, el } = await render([]);
    await click('new-bug');
    await type('bug-title', 'Falla el login');
    await type('bug-symptom', 'Devuelve 500');
    await click('bug-save');

    expect(api.createBug).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Falla el login', symptom: 'Devuelve 500' }),
    );
    expect(codes()).toEqual(['BUG-10']);
    expect(el.querySelector('[data-testid="bug-status-chip"]')?.textContent).toContain('Nuevo');
    expect(q('sheet-title')?.textContent).toContain('Falla el login');
  });

  it('CP-09-04: a blank title shows an error and does not call the API', async () => {
    const { api, q, click, type } = await render([]);
    await click('new-bug');
    await type('bug-title', '   ');
    await click('bug-save');

    expect(q('bug-error')?.textContent).toContain('Escribe un título');
    expect(api.createBug).not.toHaveBeenCalled();
  });

  it('CP-09-05: editing saves the four text fields and the sheet shows them', async () => {
    const { api, q, click, type } = await render([bug(1, 'new')]);
    await click('bug-row');
    await click('bug-edit');
    await type('bug-symptom', 'otro síntoma');
    await type('bug-impact', 'impacto');
    await type('bug-rootCause', 'causa');
    await type('bug-solution', 'solución');
    await click('bug-save');

    expect(api.updateBug).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        symptom: 'otro síntoma',
        impact: 'impacto',
        rootCause: 'causa',
        solution: 'solución',
      }),
    );
    expect(q('sheet-symptom')?.textContent).toContain('otro síntoma');
    expect(q('sheet-impact')?.textContent).toContain('impacto');
    expect(q('sheet-rootCause')?.textContent).toContain('causa');
    expect(q('sheet-solution')?.textContent).toContain('solución');
  });

  it('CP-09-06: severity defaults to Media and a chosen one is sent', async () => {
    const { api, q, click, type } = await render([]);
    await click('new-bug');
    expect((q('bug-severity') as HTMLSelectElement).value).toBe('medium');
    await type('bug-title', 'a');
    await type('bug-severity', 'high');
    await click('bug-save');
    expect(api.createBug).toHaveBeenCalledWith(expect.objectContaining({ severity: 'high' }));
  });

  it('CP-09-07: the status select offers the four states and saves the chosen one', async () => {
    const { api, q, click, type } = await render([bug(1, 'new')]);
    await click('bug-row');
    const options = [...(q('bug-status') as HTMLSelectElement).options].map((o) =>
      o.textContent?.trim(),
    );
    expect(options).toEqual(['Nuevo', 'En análisis', 'Resuelto', 'Verificado']);

    await type('bug-status', 'analysis');
    expect(api.setBugStatus).toHaveBeenCalledWith(1, 'analysis');
  });

  it('CP-09-09: filters show open, resolved or all bugs', async () => {
    const { click, codes } = await render([
      bug(1, 'new'),
      bug(2, 'analysis'),
      bug(3, 'resolved'),
      bug(4, 'verified'),
    ]);
    expect(codes()).toEqual(['BUG-1', 'BUG-2']);
    await click('filter-resolved');
    expect(codes()).toEqual(['BUG-3', 'BUG-4']);
    await click('filter-all');
    expect(codes()).toEqual(['BUG-1', 'BUG-2', 'BUG-3', 'BUG-4']);
  });

  it('CP-09-11: confirming deletes the bug, cancelling keeps it', async () => {
    const { api, q, click, codes } = await render([bug(1, 'new'), bug(2, 'new')]);
    await click('bug-row', 0);
    await click('bug-delete');
    await click('bug-delete-cancel');
    expect(api.deleteBug).not.toHaveBeenCalled();
    expect(codes()).toEqual(['BUG-1', 'BUG-2']);

    await click('bug-delete');
    await click('bug-delete-confirm');
    expect(api.deleteBug).toHaveBeenCalledWith(1);
    expect(codes()).toEqual(['BUG-2']);
    expect(q('bug-sheet')).toBeNull();
  });

  it('CP-09-14: the screen texts come from the translations', async () => {
    const { el } = await render([bug(1, 'new')]);
    expect(el.textContent).toContain('Bugs e incidencias');
    expect(el.textContent).toContain('Abiertos');
    expect(el.textContent).not.toMatch(/\bbugs\.[a-z]/i);
  });
});
