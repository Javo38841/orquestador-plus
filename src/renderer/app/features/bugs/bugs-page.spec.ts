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
  const squash = (e: HTMLElement | null) => e?.textContent?.replace(/\s+/g, ' ').trim();
  const codes = () =>
    [...el.querySelectorAll('[data-testid="bug-code"]')].map((c) => c.textContent?.trim());
  return { api, el, q, click, type, settle, codes, squash };
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

  it('CP-09-21: the status pills save the chosen state and refresh tabs and sidebar count', async () => {
    const { api, q, click, el, squash } = await render([bug(1, 'new'), bug(2, 'new')]);
    await click('bug-row');
    const pills = [...(q('bug-status') as HTMLElement).querySelectorAll('button')];
    expect(pills.map((p) => p.textContent?.trim())).toEqual([
      'Nuevo',
      'En análisis',
      'Resuelto',
      'Verificado',
    ]);
    expect(q('status-new')?.className).toContain('bg-accent');
    expect(q('status-resolved')?.className).not.toContain('bg-accent');

    await click('status-resolved');
    expect(api.setBugStatus).toHaveBeenCalledWith(1, 'resolved');
    expect(q('status-resolved')?.className).toContain('bg-accent');
    expect(squash(q('tab-open'))).toContain('Abiertos · 1');
    expect(squash(q('tab-resolved'))).toContain('Resueltos · 1');
    expect(squash(q('tab-all'))).toContain('Todos · 2');
    expect(el.querySelector('[data-testid="bug-sheet"]')).not.toBeNull();
    expect(q('tab-resolved')?.getAttribute('aria-selected')).toBe('true');
  });

  it('CP-09-15: the tabs show Todos, Abiertos and Resueltos with their counts', async () => {
    const { el } = await render([
      bug(1, 'new'),
      bug(2, 'analysis'),
      bug(3, 'resolved'),
      bug(4, 'verified'),
      bug(5, 'verified'),
    ]);
    const tabs = [...el.querySelectorAll('[role="tab"]')].map((t) =>
      t.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(tabs).toEqual(['Todos · 5', 'Abiertos · 2', 'Resueltos · 3']);
  });

  it('CP-09-16: each card shows the code, severity badge, title and status chip', async () => {
    const { q } = await render([bug(14, 'analysis', { severity: 'high', title: 'Falla X' })]);
    const card = q('bug-row') as HTMLElement;
    expect(q('bug-code')?.className).toContain('font-mono');
    expect(q('bug-code')?.textContent).toBe('BUG-14');
    expect(card.querySelector('[data-testid="severity-badge"]')?.textContent).toContain('Alta');
    expect(card.textContent).toContain('Falla X');
    expect(card.querySelector('[data-testid="bug-status-badge"]')?.textContent).toContain(
      'En análisis',
    );
  });

  it('CP-09-17: severity badges are red, amber and blue', async () => {
    const { el, click } = await render([
      bug(1, 'new', { severity: 'high' }),
      bug(2, 'new', { severity: 'medium' }),
      bug(3, 'new', { severity: 'low' }),
    ]);
    await click('tab-all');
    const badges = [...el.querySelectorAll('[data-testid="severity-badge"]')];
    expect(badges[0].className).toContain('text-danger');
    expect(badges[1].className).toContain('text-warn');
    expect(badges[2].className).toContain('text-project');
  });

  it('CP-09-18: only the selected card has the turquoise border', async () => {
    const { el, click } = await render([bug(1, 'new'), bug(2, 'new')]);
    await click('bug-row', 1);
    const rows = [...el.querySelectorAll('[data-testid="bug-row"]')];
    expect(rows[0].className).not.toContain('border-accent');
    expect(rows[1].className).toContain('border-accent');
  });

  it('CP-09-19: the read-only sheet shows the header, big title and uppercase sections', async () => {
    const created = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const { q, click } = await render([
      bug(12, 'new', { createdAt: created, title: 'Título', symptom: 'algo', impact: 'mucho' }),
    ]);
    expect(q('bug-sheet')).toBeNull();
    await click('bug-row');
    expect(q('bug-form')).toBeNull();
    expect(q('sheet-header')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'BUG-12 · abierto hace 3 días',
    );
    expect(q('sheet-title')?.className).toContain('text-2xl');
    const text = q('bug-sheet')?.textContent ?? '';
    for (const heading of ['SÍNTOMA', 'IMPACTO', 'CAUSA RAÍZ', 'SOLUCIÓN']) {
      expect(text).toContain(heading);
    }
    expect(q('sheet-symptom')?.textContent).toContain('algo');
  });

  it('CP-09-20: an empty section shows "Sin completar" instead of disappearing', async () => {
    const { q, click } = await render([bug(1, 'new', { symptom: 'algo' })]);
    await click('bug-row');
    expect(q('sheet-impact')?.textContent).toContain('Sin completar');
    expect(q('sheet-rootCause')?.textContent).toContain('Sin completar');
    expect(q('sheet-solution')?.textContent).toContain('Sin completar');
    expect(q('sheet-symptom')?.textContent).not.toContain('Sin completar');
  });

  it('CP-09-22: the header says hoy, hace 1 día or hace N días from the creation date', async () => {
    const ago = (days: number) =>
      new Date(new Date().setDate(new Date().getDate() - days)).toISOString();
    const header = async (days: number) => {
      TestBed.resetTestingModule();
      const view = await render([bug(1, 'new', { createdAt: ago(days) })]);
      await view.click('bug-row');
      return view.q('sheet-header')?.textContent?.replace(/\s+/g, ' ').trim();
    };
    expect(await header(0)).toBe('BUG-1 · abierto hoy');
    expect(await header(1)).toBe('BUG-1 · abierto hace 1 día');
    expect(await header(5)).toBe('BUG-1 · abierto hace 5 días');
  });

  it('CP-09-23: the form is not the default; Nuevo bug and Editar open it, cancel and save go back', async () => {
    const { q, click, type } = await render([bug(1, 'new', { symptom: 'algo' })]);
    expect(q('bug-form')).toBeNull();

    await click('new-bug');
    expect(q('bug-form')).not.toBeNull();
    expect((q('bug-title') as HTMLInputElement).value).toBe('');
    await click('bug-cancel');
    expect(q('bug-form')).toBeNull();

    await click('bug-row');
    await click('bug-edit');
    expect((q('bug-title') as HTMLInputElement).value).toBe('bug 1');
    expect((q('bug-symptom') as HTMLTextAreaElement).value).toBe('algo');
    await click('bug-cancel');
    expect(q('bug-sheet')).not.toBeNull();

    await click('bug-edit');
    await type('bug-title', 'nuevo título');
    await click('bug-save');
    expect(q('bug-form')).toBeNull();
    expect(q('bug-sheet')).not.toBeNull();
  });

  it('CP-09-24: a filter without results keeps the empty state with "Nuevo bug" and hides the sheet', async () => {
    const { q, click } = await render([bug(1, 'new')]);
    await click('bug-row');
    expect(q('bug-sheet')).not.toBeNull();

    await click('tab-resolved');
    expect(q('bugs-empty-filter')?.textContent).toContain('No hay bugs en este filtro');
    expect(q('empty-new-bug')?.textContent).toContain('Nuevo bug');
    expect(q('bug-sheet')).toBeNull();

    await click('empty-new-bug');
    expect(q('bug-form')).not.toBeNull();
  });

  it('CP-09-09: filters show open, resolved or all bugs', async () => {
    const { click, codes } = await render([
      bug(1, 'new'),
      bug(2, 'analysis'),
      bug(3, 'resolved'),
      bug(4, 'verified'),
    ]);
    expect(codes()).toEqual(['BUG-1', 'BUG-2']);
    await click('tab-resolved');
    expect(codes()).toEqual(['BUG-3', 'BUG-4']);
    await click('tab-all');
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

  it('CP-09-26: tabs, sections, pills, age and empty states have no missing translation keys', async () => {
    const { el, click } = await render([bug(1, 'new')]);
    await click('bug-row');
    expect(el.textContent).not.toMatch(/\b(bugs|ui)\.[a-zA-Z]+/);
    await click('tab-resolved');
    expect(el.textContent).not.toMatch(/\b(bugs|ui)\.[a-zA-Z]+/);
  });
});
