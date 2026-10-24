import { provideRouter, Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { InboxItem } from '../../../../shared/inbox';
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
  tags: [],
  createdAt: '2026-03-01T10:00:00.000Z',
  completedAt: null,
  seriesId: null,
  recurrence: { kind: 'once' },
  reminderAt: null,
  reminderNotifiedAt: null,
  hiddenFromTodayAt: null,
  ...extra,
});

async function render(stored: Task[], inbox: InboxItem[] = []) {
  // Behaves like main: completing stamps completedAt, hiding stamps hiddenFromTodayAt.
  const setTaskStatus = vi.fn(async (id: number, status: Task['status']): Promise<TaskResult> => {
    const at = stored.findIndex((t) => t.id === id);
    const completedAt = status === 'done' ? new Date().toISOString() : null;
    stored[at] = { ...stored[at], status, completedAt };
    return { ok: true, task: stored[at] };
  });
  const hideFromToday = vi.fn(async (ids: number[]) => {
    const stamp = new Date(Date.now() + 1).toISOString();
    for (const [i, t] of stored.entries()) {
      if (ids.includes(t.id) && t.status === 'done') stored[i] = { ...t, hiddenFromTodayAt: stamp };
    }
    return ids.length;
  });
  const captureInbox = vi.fn(async (title: string) => ({
    ok: true as const,
    item: {
      id: 99,
      title,
      source: 'quick_capture' as const,
      createdAt: '2026-03-01T10:00:00.000Z',
    },
  }));
  const api = {
    listTasks: async () => [...stored],
    listTags: async () => [],
    listProjects: async () => [],
    setTaskStatus,
    hideFromToday,
    listInbox: async () => inbox,
    captureInbox: captureInbox,
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
    providers: [{ provide: DESKTOP_API, useValue: api }, provideRouter([])],
  }).compileComponents();
  const fixture = TestBed.createComponent(TodayPage);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const q = <T extends HTMLElement>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`);
  return { el, settle, q, captureInbox, hideFromToday };
}

describe('TodayPage', () => {
  it('CP-03-01: an overdue task appears under "Atrasadas" with "Ayer"', async () => {
    const { el } = await render([task(1, { dueDate: shift(-1) })]);
    const section = el.querySelector('[data-testid="today-overdue"]')!;
    expect(section.textContent).toContain('ATRASADAS');
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

  describe('completed tasks stay struck through (#93)', () => {
    const rows = (el: HTMLElement) =>
      Array.from(el.querySelectorAll<HTMLElement>('[data-testid="today-task"]'));
    const toggle = async (
      el: HTMLElement,
      settle: () => Promise<void>,
      index: number,
      on: boolean,
    ) => {
      const check = rows(el)[index].querySelector<HTMLInputElement>('[data-testid="today-check"]')!;
      check.checked = on;
      check.dispatchEvent(new Event('change'));
      await settle();
    };
    const doneToday = (id: number, extra: Partial<Task> = {}) =>
      task(id, { forToday: true, status: 'done', completedAt: new Date().toISOString(), ...extra });

    it('CP-03-24: completing a task keeps it struck through in place and lowers the counts', async () => {
      const { el, settle, q } = await render([
        task(1, { forToday: true }),
        task(2, { forToday: true }),
        task(3, { forToday: true }),
      ]);
      expect(q('today-subtitle')!.textContent).toContain('3 pendientes');

      await toggle(el, settle, 1, true);

      expect(rows(el).map((r) => r.textContent)).toEqual([
        expect.stringContaining('Tarea 1'),
        expect.stringContaining('Tarea 2'),
        expect.stringContaining('Tarea 3'),
      ]);
      const done = rows(el)[1];
      expect(done.dataset['done']).toBe('true');
      expect(done.querySelector<HTMLInputElement>('[data-testid="today-check"]')!.checked).toBe(
        true,
      );
      expect(done.querySelector('[data-testid="today-title"]')!.className).toContain(
        'line-through',
      );
      expect(rows(el)[0].querySelector('[data-testid="today-title"]')!.className).not.toContain(
        'line-through',
      );
      expect(q('today-subtitle')!.textContent).toContain('2 pendientes');
      expect(q('today-list-title')!.textContent?.trim()).toBe('PARA HOY · 2');
    });

    it('CP-03-25: tasks completed on another day do not appear', async () => {
      const yesterday = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
      const { el } = await render([doneToday(1, { completedAt: yesterday })]);
      expect(rows(el)).toHaveLength(0);
      expect(el.textContent).toContain('No tienes nada pendiente para hoy.');
    });

    it('CP-03-26: unchecking a struck task makes it pending again and raises the counts', async () => {
      const { el, settle, q } = await render([doneToday(1), task(2, { forToday: true })]);
      expect(q('today-subtitle')!.textContent).toContain('1 pendiente ');

      await toggle(el, settle, 0, false);

      expect(rows(el)[0].dataset['done']).toBeUndefined();
      expect(rows(el)[0].querySelector('[data-testid="today-title"]')!.className).not.toContain(
        'line-through',
      );
      expect(q('today-subtitle')!.textContent).toContain('2 pendientes');
    });

    it('CP-03-27: "Quitar de la lista" hides a struck task from Hoy without deleting it', async () => {
      const { el, settle, hideFromToday } = await render([
        doneToday(1),
        task(2, { forToday: true }),
      ]);
      expect(rows(el)[1].querySelector('[data-testid="today-hide"]')).toBeNull();
      const hide = rows(el)[0].querySelector<HTMLButtonElement>('[data-testid="today-hide"]')!;
      expect(hide.getAttribute('aria-label')).toBe('Quitar de la lista');
      expect(hide.title).toBe('Quitar de la lista de Hoy (la tarea no se borra)');

      hide.click();
      await settle();
      await new Promise((resolve) => setTimeout(resolve));
      await settle();

      expect(hideFromToday).toHaveBeenCalledWith([1]);
      expect(rows(el).map((r) => r.textContent)).toEqual([expect.stringContaining('Tarea 2')]);
    });

    it('CP-03-28: "Limpiar completadas" takes every struck task off and only shows when there are some', async () => {
      const first = await render([task(1, { forToday: true })]);
      expect(first.q('today-clear-done')).toBeNull();
      TestBed.resetTestingModule();

      const { el, settle, q, hideFromToday } = await render([
        doneToday(1),
        doneToday(2, { forToday: false, dueDate: shift(-1) }),
        task(3, { forToday: true }),
      ]);
      expect(q('today-clear-done')!.textContent?.trim()).toBe('Limpiar completadas (2)');

      q('today-clear-done')!.click();
      await settle();
      await new Promise((resolve) => setTimeout(resolve));
      await settle();

      expect(hideFromToday).toHaveBeenCalledWith([2, 1]);
      expect(rows(el)).toHaveLength(1);
      expect(q('today-clear-done')).toBeNull();
    });

    it('CP-03-31: the focus block only offers tasks still to do', async () => {
      const { el } = await render([doneToday(1), task(2, { forToday: true })]);
      const options = Array.from(el.querySelectorAll('[data-testid="focus-task"] option')).map(
        (o) => o.textContent?.trim(),
      );
      expect(options).toEqual(['Elige una tarea', 'Tarea 2']);
    });
  });

  it('CP-07-01: tags show as #chips on tasks in Hoy', async () => {
    const { el } = await render([task(1, { forToday: true, tags: ['infra'] })]);
    const chips = [...el.querySelectorAll('[data-testid="today-tag"]')].map((c) =>
      c.textContent?.trim(),
    );
    expect(chips).toEqual(['#infra']);
  });

  it('CP-03-09: tasks go in the left column and Enfoque, Mañana and portal in the right one', async () => {
    const { q } = await render(
      [task(1, { forToday: true })],
      [{ id: 1, title: 'x', source: 'portal', createdAt: '2026-03-01T10:00:00.000Z' }],
    );
    expect(q('today-main')!.querySelector('[data-testid="today-task"]')).not.toBeNull();
    const side = q('today-side')!;
    expect(side.querySelector('[data-testid="focus"]')).not.toBeNull();
    expect(side.querySelector('[data-testid="today-tomorrow"]')).not.toBeNull();
    expect(side.querySelector('[data-testid="today-portal"]')).not.toBeNull();
    expect(q('today-main')!.querySelector('[data-testid="focus"]')).toBeNull();
  });

  it('CP-03-10: "+ Nueva tarea" opens the task form', async () => {
    const { el } = await render([]);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const button = el.querySelector<HTMLButtonElement>('[data-testid="primary-button"]')!;
    expect(button.textContent).toContain('Nueva tarea');
    button.click();
    expect(navigate).toHaveBeenCalledWith(['/tasks'], { queryParams: { new: 1 } });
  });

  it('CP-03-11: Enter in the capture bar sends the text to the inbox and clears it', async () => {
    const { el, q, settle, captureInbox } = await render([]);
    const input = q<HTMLInputElement>('today-capture')!;
    expect(input.placeholder).toBe('Anota una tarea, idea o bug y presiona Enter…');
    expect(el.textContent).toContain('Ctrl + Espacio');
    input.value = '  Revisar el deploy ';
    input.dispatchEvent(new Event('input'));
    await settle();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    await new Promise((resolve) => setTimeout(resolve));
    await settle();
    expect(captureInbox).toHaveBeenCalledWith('Revisar el deploy');
    expect(input.value).toBe('');
  });

  it('CP-03-12: an empty or blank capture bar creates nothing', async () => {
    const { q, settle, captureInbox } = await render([]);
    const input = q<HTMLInputElement>('today-capture')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    input.value = '   ';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    expect(captureInbox).not.toHaveBeenCalled();
  });

  it('CP-03-13: group titles carry the count and an empty group is hidden', async () => {
    const { q } = await render([
      task(1, { dueDate: shift(-1) }),
      task(2, { dueDate: shift(-3) }),
      task(3, { forToday: true }),
    ]);
    expect(q('today-overdue-title')!.textContent!.trim()).toBe('ATRASADAS · 2');
    expect(q('today-overdue-title')!.classList).toContain('text-warn');
    expect(q('today-list-title')!.textContent!.trim()).toBe('PARA HOY · 1');
  });

  it('CP-03-13: a group without tasks is not shown', async () => {
    const { q } = await render([task(1, { forToday: true })]);
    expect(q('today-overdue')).toBeNull();
  });

  it('CP-03-14: a task card shows checkbox, title and project, tag and repeat chips', async () => {
    const { el } = await render([
      task(1, {
        forToday: true,
        projectName: 'Orquestador',
        tags: ['infra'],
        recurrence: { kind: 'daily' },
      }),
      task(2, { forToday: true }),
    ]);
    const [first, second] = [...el.querySelectorAll('[data-testid="today-task"]')];
    expect(first.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(first.querySelector('[data-testid="project-chip"]')!.textContent).toBe('Orquestador');
    expect(first.querySelector('[data-testid="tag-chip"]')!.textContent).toBe('#infra');
    expect(first.querySelector('[data-testid="repeat-chip"]')).not.toBeNull();
    expect(second.querySelector('[data-testid="project-chip"]')!.textContent).toBe('Suelta');
    expect(second.querySelector('[data-testid="repeat-chip"]')).toBeNull();
  });

  it('CP-03-15: the date shows "Ayer" and "Hace 2 días" in amber and "Hoy" neutral', async () => {
    const { el } = await render([
      task(1, { dueDate: shift(-1) }),
      task(2, { dueDate: shift(-2) }),
      task(3, { dueDate: shift(0) }),
    ]);
    const dates = [...el.querySelectorAll('[data-testid="relative-date"]')];
    expect(dates.map((d) => d.textContent)).toEqual(['Ayer', 'Hace 2 días', 'Hoy']);
    expect(dates[0].classList).toContain('text-warn');
    expect(dates[1].classList).toContain('text-warn');
    expect(dates[2].classList).not.toContain('text-warn');
  });

  it('CP-03-17: the Mañana card lists tasks due tomorrow, or an empty message', async () => {
    const full = await render([task(1, { dueDate: shift(1) })]);
    expect(full.q('today-tomorrow')!.textContent).toContain('Tarea 1');
    expect(full.q('tomorrow-empty')).toBeNull();
    TestBed.resetTestingModule();
    const empty = await render([]);
    expect(empty.q('tomorrow-empty')!.textContent).toContain('Nada programado');
  });

  it('CP-03-18: completed tasks and tasks due today or in two days are not in Mañana', async () => {
    const { q } = await render([
      task(1, { dueDate: shift(1), status: 'done' }),
      task(2, { dueDate: shift(0) }),
      task(3, { dueDate: shift(2) }),
    ]);
    expect(q('tomorrow-empty')).not.toBeNull();
  });

  it('CP-03-19: the portal card counts pending reports, with singular for one', async () => {
    const report = (id: number): InboxItem => ({
      id,
      title: 'r',
      source: 'portal',
      createdAt: '2026-03-01T10:00:00.000Z',
    });
    const two = await render([], [report(1), report(2)]);
    expect(two.q('portal-pending')!.textContent).toBe('2 reportes esperan revisión');
    expect(two.q('today-portal')!.querySelector('h2')!.classList).toContain('text-warn');
    TestBed.resetTestingModule();
    const one = await render([], [report(1)]);
    expect(one.q('portal-pending')!.textContent).toBe('1 reporte espera revisión');
  });

  it('CP-03-20: without pending portal reports the card is not shown', async () => {
    const { q } = await render(
      [],
      [{ id: 1, title: 'x', source: 'quick_capture', createdAt: '2026-03-01T10:00:00.000Z' }],
    );
    expect(q('today-portal')).toBeNull();
  });

  it('CP-03-21: the new texts are rendered from es.json', async () => {
    const { el } = await render([task(1, { dueDate: shift(-1) })]);
    const text = el.textContent!;
    for (const expected of ['Nueva tarea', 'Mañana', 'ATRASADAS · 1', 'Ctrl + Espacio']) {
      expect(text).toContain(expected);
    }
  });
});
