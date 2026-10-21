import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type { Task } from '../../../../shared/tasks';
import { DESKTOP_API } from '../../core/desktop-api';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { TasksStore } from '../tasks/tasks.store';
import { SeriesList } from './series-list';

const task = (id: number, extra: Partial<Task> = {}): Task => ({
  id,
  title: `Serie ${id}`,
  status: 'todo',
  dueDate: '2026-03-06',
  projectId: null,
  projectName: null,
  forToday: false,
  tags: [],
  createdAt: '2026-03-01T10:00:00.000Z',
  completedAt: null,
  seriesId: id,
  recurrence: { kind: 'daily' },
  ...extra,
});

const STORED: Task[] = [
  task(1, {
    title: 'Revisar backups',
    recurrence: { kind: 'weekly', weekday: 5 },
    projectId: 1,
    projectName: 'infra',
    dueDate: '2026-03-13',
  }),
  task(2, { title: 'Standup', recurrence: { kind: 'daily' }, dueDate: '2026-03-07' }),
  task(3, {
    title: 'Facturar',
    recurrence: { kind: 'monthly', monthDay: 31 },
    projectId: 2,
    projectName: 'admin',
    dueDate: '2026-03-31',
  }),
  task(4, { title: 'Plana', seriesId: null, recurrence: { kind: 'once' } }),
  task(5, { title: 'Hecha', status: 'done', seriesId: 5, completedAt: '2026-03-02T00:00:00Z' }),
];

async function render(stored: Task[] = STORED) {
  const deleteSeries = vi.fn(async () => true);
  const api = {
    listTasks: vi.fn(async () => (deleteSeries.mock.calls.length ? [] : stored)),
    listTags: async () => [],
    listProjects: async () => [
      { id: 1, name: 'infra' },
      { id: 2, name: 'admin' },
    ],
    deleteSeries,
  } as unknown as OrquestadorApi;
  await TestBed.configureTestingModule({
    imports: [
      SeriesList,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
    providers: [{ provide: DESKTOP_API, useValue: api }],
  }).compileComponents();
  await TestBed.inject(TasksStore).load();
  const fixture = TestBed.createComponent(SeriesList);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const q = <T extends HTMLElement>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`);
  const rows = () => [...el.querySelectorAll('[data-testid="series-row"]')];
  const choose = async (id: string, value: string) => {
    const select = q<HTMLSelectElement>(id)!;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    await settle();
  };
  return { fixture, el, q, rows, choose, settle, deleteSeries };
}

describe('SeriesList', () => {
  it('CP-06-09: lists task, project, repetition and next due date of each open series', async () => {
    const { rows } = await render();
    expect(rows()).toHaveLength(3);
    const first = rows().find((r) => r.textContent!.includes('Revisar backups'))!;
    expect(first.querySelector('[data-testid="series-project"]')!.textContent).toContain('infra');
    expect(first.querySelector('[data-testid="series-rule"]')!.textContent).toContain(
      'Semanal · viernes',
    );
    expect(first.querySelector('[data-testid="series-next"]')!.textContent).toContain('2026-03-13');
    const monthly = rows().find((r) => r.textContent!.includes('Facturar'))!;
    expect(monthly.querySelector('[data-testid="series-rule"]')!.textContent).toContain(
      'Mensual · día 31',
    );
    expect(rows().map((r) => r.querySelector('[data-testid="series-title"]')!.textContent)).toEqual(
      ['Standup', 'Revisar backups', 'Facturar'],
    );
  });

  it('CP-06-09: filters by project and by repetition type', async () => {
    const { rows, choose } = await render();
    await choose('series-filter-project', '1');
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('Revisar backups');

    await choose('series-filter-project', '');
    await choose('series-filter-kind', 'daily');
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('Standup');

    await choose('series-filter-kind', 'monthly');
    expect(rows()[0].textContent).toContain('Facturar');
  });

  it('shows an empty message when there are no series', async () => {
    const { el } = await render([task(4, { seriesId: null, recurrence: { kind: 'once' } })]);
    expect(el.textContent).toContain('No hay series recurrentes.');
  });

  it('CP-06-11: deleting a series asks first and only deletes after confirming', async () => {
    const { q, el, settle, deleteSeries, rows } = await render();
    q('series-delete')!.click();
    await settle();
    expect(deleteSeries).not.toHaveBeenCalled();
    expect(el.textContent).toContain('¿Eliminar la serie');

    q('series-delete-confirm')!.click();
    await settle();
    expect(deleteSeries).toHaveBeenCalledWith(2);
    expect(rows()).toHaveLength(0);
  });

  it('CP-06-11: cancelling the confirmation keeps the series', async () => {
    const { q, el, settle, deleteSeries, rows } = await render();
    q('series-delete')!.click();
    await settle();
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'No')!.click();
    await settle();
    expect(deleteSeries).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(3);
  });

  it('emits the open instance when editing', async () => {
    const { fixture, q } = await render();
    const edited: Task[] = [];
    fixture.componentInstance.edit.subscribe((t) => edited.push(t));
    q('series-edit')!.click();
    expect(edited.map((t) => t.id)).toEqual([2]);
  });
});
