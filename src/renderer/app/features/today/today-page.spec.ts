import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { OrquestadorApi } from '../../../../shared/ipc';
import { localDate, type Task, type TaskResult } from '../../../../shared/tasks';
import { formatLongDate } from '../../../../shared/today';
import { DESKTOP_API } from '../../core/desktop-api';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { TodayPage } from './today-page';

const shift = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localDate(d);
};

const task = (id: number, extra: Partial<Task> = {}): Task => ({
  id,
  title: `Tarea ${id}`,
  status: 'todo',
  dueDate: null,
  projectId: null,
  projectName: null,
  forToday: false,
  createdAt: '2026-03-01T10:00:00.000Z',
  ...extra,
});

async function render(stored: Task[]) {
  const setTaskStatus = vi.fn(async (id: number, status: Task['status']): Promise<TaskResult> => ({
    ok: true,
    task: { ...stored.find((t) => t.id === id)!, status },
  }));
  const api = {
    listTasks: async () => stored,
    listProjects: async () => [],
    setTaskStatus,
  } as unknown as OrquestadorApi;
  await TestBed.configureTestingModule({
    imports: [
      TodayPage,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
    providers: [{ provide: DESKTOP_API, useValue: api }],
  }).compileComponents();
  const fixture = TestBed.createComponent(TodayPage);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { el, settle };
}

describe('TodayPage', () => {
  it('CP-03-01: an overdue task appears under "Atrasadas" with "Ayer"', async () => {
    const { el } = await render([task(1, { dueDate: shift(-1) })]);
    const section = el.querySelector('[data-testid="today-overdue"]')!;
    expect(section.textContent).toContain('Atrasadas');
    expect(section.textContent).toContain('Tarea 1');
    expect(section.querySelector('[data-testid="today-due"]')!.textContent).toContain('Ayer');
  });

  it('CP-03-02: a task due today appears under "Para hoy"', async () => {
    const { el } = await render([task(1, { dueDate: shift(0) })]);
    expect(el.querySelector('[data-testid="today-list"]')!.textContent).toContain('Tarea 1');
  });

  it('CP-03-03: an undated task marked for today appears under "Para hoy"', async () => {
    const { el } = await render([task(1, { forToday: true })]);
    expect(el.querySelector('[data-testid="today-list"]')!.textContent).toContain('Tarea 1');
  });

  it('CP-03-04: completed tasks and tasks due tomorrow do not appear', async () => {
    const { el } = await render([
      task(1, { status: 'done', dueDate: shift(0) }),
      task(2, { dueDate: shift(1) }),
    ]);
    expect(el.querySelectorAll('[data-testid="today-task"]')).toHaveLength(0);
  });

  it('CP-03-06: the subtitle shows the Spanish date and the counts', async () => {
    const { el } = await render([
      task(1, { dueDate: shift(-2) }),
      task(2, { dueDate: shift(-1) }),
      task(3, { dueDate: shift(0) }),
      task(4, { forToday: true }),
      task(5, { dueDate: shift(0) }),
    ]);
    expect(el.querySelector('[data-testid="today-subtitle"]')!.textContent).toBe(
      `${formatLongDate()} · 5 pendientes · 2 atrasadas`,
    );
  });

  it('CP-03-07: completing a task removes it and lowers the count', async () => {
    const { el, settle } = await render([task(1, { forToday: true }), task(2, { forToday: true })]);
    const subtitle = () => el.querySelector('[data-testid="today-subtitle"]')!.textContent;
    expect(subtitle()).toContain('2 pendientes');

    const check = el.querySelector<HTMLInputElement>('[data-testid="today-check"]')!;
    check.checked = true;
    check.dispatchEvent(new Event('change'));
    await settle();

    expect(el.querySelectorAll('[data-testid="today-task"]')).toHaveLength(1);
    expect(subtitle()).toContain('1 pendiente ');
  });
});
