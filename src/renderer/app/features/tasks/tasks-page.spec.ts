import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { OrquestadorApi } from '../../../../shared/ipc';
import { localDate, type Task, type TaskResult } from '../../../../shared/tasks';
import { DESKTOP_API } from '../../core/desktop-api';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { TasksPage } from './tasks-page';

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
  ...extra,
});

async function render(
  stored: Task[],
  overrides: Partial<Record<keyof OrquestadorApi, unknown>> = {},
  queryParams: Record<string, string> = {},
) {
  const deleteTask = vi.fn(async () => true);
  const createTask = vi.fn(async (input): Promise<TaskResult> => ({
    ok: true,
    task: task(50, { title: input.title }),
  }));
  const api = {
    listTasks: async () => stored,
    listTags: async () => ['infra', 'infrared'],
    listProjects: async () => [{ id: 1, name: 'api-gateway' }],
    createTask,
    deleteTask,
    getRemindersEnabled: async () => true,
    setRemindersEnabled: async (value: boolean) => value,
    ...overrides,
  } as unknown as OrquestadorApi;
  await TestBed.configureTestingModule({
    imports: [
      TasksPage,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
    providers: [
      { provide: DESKTOP_API, useValue: api },
      { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(queryParams)) } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(TasksPage);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`);
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, el, q, settle, deleteTask, createTask };
}

describe('TasksPage', () => {
  it('CP-10-11: arriving with ?task=<id> highlights that task, even a completed one', async () => {
    const { el, settle } = await render(
      [task(1), task(2, { status: 'done', completedAt: '2026-03-02T10:00:00.000Z' })],
      {},
      { task: '2' },
    );
    await settle();

    const marked = el.querySelectorAll('[data-highlighted="true"]');
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toContain('Tarea 2');
  });

  it('CP-02-08: shows the Tarea, Proyecto and Vence columns', async () => {
    const { el } = await render([task(1)]);
    const headers = el.querySelector('[data-testid="task-list"] > div')!.textContent!;
    expect(headers).toContain('Tarea');
    expect(headers).toContain('Proyecto');
    expect(headers).toContain('Vence');
  });

  it('CP-02-08: overdue tasks use the warning color and others do not', async () => {
    const { el } = await render([
      task(1, { dueDate: '2000-01-01' }),
      task(2, { dueDate: '2999-01-01' }),
      task(3, { dueDate: localDate() }),
    ]);
    const dates = [...el.querySelectorAll('[data-testid="task-due-date"]')];
    expect(dates.map((d) => d.classList.contains('text-warn'))).toEqual([true, false, false]);
  });

  it('CP-02-01: a task without a project shows the "Suelta" chip, with one shows its name', async () => {
    const { el } = await render([task(1), task(2, { projectId: 1, projectName: 'api-gateway' })]);
    const chips = [...el.querySelectorAll('[data-testid="task-project-chip"]')].map((c) =>
      c.textContent?.trim(),
    );
    expect(chips).toEqual(['Suelta', 'api-gateway']);
  });

  it('CP-02-05: deleting asks for confirmation and only deletes after confirming', async () => {
    const { q, el, settle, deleteTask } = await render([task(1)]);

    q('task-delete')!.click();
    await settle();
    expect(deleteTask).not.toHaveBeenCalled();
    expect(el.textContent).toContain('¿Eliminar esta tarea?');

    q('task-delete-confirm')!.click();
    await settle();
    expect(deleteTask).toHaveBeenCalledWith(1);
    expect(el.querySelectorAll('[data-testid="task-row"]')).toHaveLength(0);
  });

  it('CP-02-05: cancelling the confirmation keeps the task', async () => {
    const { q, el, settle, deleteTask } = await render([task(1)]);
    q('task-delete')!.click();
    await settle();
    const no = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'No')!;
    no.click();
    await settle();

    expect(deleteTask).not.toHaveBeenCalled();
    expect(el.querySelectorAll('[data-testid="task-row"]')).toHaveLength(1);
  });

  it('CP-02-06: an empty title shows a clear message and does not save', async () => {
    const { q, settle, createTask } = await render([]);
    q('new-task')!.click();
    await settle();
    q('task-save')!.click();
    await settle();

    expect(q('task-error')?.textContent).toContain('Escribe un título para la tarea');
    expect(createTask).not.toHaveBeenCalled();
  });

  it('CP-02-06: a title over 200 characters shows "Máximo 200 caracteres"', async () => {
    const { q, settle, createTask } = await render([]);
    q('new-task')!.click();
    await settle();
    const title = q<HTMLInputElement>('task-title')!;
    title.value = 'a'.repeat(201);
    title.dispatchEvent(new Event('input'));
    q('task-save')!.click();
    await settle();

    expect(q('task-error')?.textContent).toContain('Máximo 200 caracteres');
    expect(createTask).not.toHaveBeenCalled();
  });

  it('CP-02-01: saving a valid title sends it without project and closes the form', async () => {
    const { q, settle, createTask } = await render([]);
    q('new-task')!.click();
    await settle();
    const title = q<HTMLInputElement>('task-title')!;
    title.value = 'Llamar al dentista';
    title.dispatchEvent(new Event('input'));
    q('task-save')!.click();
    await settle();

    expect(createTask).toHaveBeenCalledWith({
      title: 'Llamar al dentista',
      dueDate: null,
      projectId: null,
      newProjectName: null,
      tags: [],
      recurrence: { kind: 'once' },
      reminderAt: null,
    });
    expect(q('task-form')).toBeNull();
  });

  it('CP-02-02: choosing "new project" without a name is rejected', async () => {
    const { q, settle, createTask } = await render([]);
    q('new-task')!.click();
    await settle();
    const title = q<HTMLInputElement>('task-title')!;
    title.value = 'x';
    title.dispatchEvent(new Event('input'));
    const select = q<HTMLSelectElement>('task-project')!;
    select.value = 'new';
    select.dispatchEvent(new Event('change'));
    await settle();
    q('task-save')!.click();
    await settle();

    expect(q('task-error')).not.toBeNull();
    expect(createTask).not.toHaveBeenCalled();
  });

  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  it('CP-07-01: a task with tags shows a #chip per tag', async () => {
    const { el } = await render([task(1, { tags: ['infra', 'api'] }), task(2)]);
    const chips = [...el.querySelectorAll('[data-testid="task-tag"]')].map((c) =>
      c.textContent?.trim(),
    );
    expect(chips).toEqual(['#infra', '#api']);
  });

  it('CP-07-02: typing "#Infra" adds one normalized chip, a duplicate is ignored', async () => {
    const { q, el, settle, createTask } = await render([]);
    q('new-task')!.click();
    await settle();
    type(q<HTMLInputElement>('task-title')!, 'Migrar DNS');
    for (const raw of ['#Infra', 'infra']) {
      type(q<HTMLInputElement>('tag-input')!, raw);
      q('tag-add')!.click();
      await settle();
    }
    const chips = [...el.querySelectorAll('[data-testid="tag-chip"]')].map((c) =>
      c.textContent?.replace('×', '').trim(),
    );
    expect(chips).toEqual(['#infra']);

    q('task-save')!.click();
    await settle();
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ tags: ['infra'] }));
  });

  it('CP-07-02: a tag typed but not added is saved with the task', async () => {
    const { q, settle, createTask } = await render([]);
    q('new-task')!.click();
    await settle();
    type(q<HTMLInputElement>('task-title')!, 'x');
    type(q<HTMLInputElement>('tag-input')!, 'Infra');
    q('task-save')!.click();
    await settle();
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ tags: ['infra'] }));
  });

  it('CP-07-03: an empty tag, one with spaces or over 30 characters shows a clear message', async () => {
    const { q, settle, createTask } = await render([]);
    q('new-task')!.click();
    await settle();
    const cases: [string, string][] = [
      ['   ', 'La etiqueta no puede estar vacía'],
      ['dos palabras', 'La etiqueta no puede contener espacios'],
      ['a'.repeat(31), 'La etiqueta admite como máximo 30 caracteres'],
    ];
    for (const [value, message] of cases) {
      type(q<HTMLInputElement>('tag-input')!, value);
      q('tag-add')!.click();
      await settle();
      expect(q('tag-error')?.textContent).toContain(message);
    }
    expect(q('tag-chip')).toBeNull();
    expect(createTask).not.toHaveBeenCalled();
  });

  it('CP-07-04: the filter shows only tasks with the tag and "Todas" brings everything back', async () => {
    const { q, el, settle } = await render([
      task(1, { tags: ['infra'] }),
      task(2),
      task(3, { tags: ['api'] }),
    ]);
    const rows = () => el.querySelectorAll('[data-testid="task-row"]').length;
    expect(rows()).toBe(3);

    const options = [...el.querySelectorAll<HTMLElement>('[data-testid="tag-filter-option"]')];
    options.find((b) => b.textContent?.trim() === '#infra')!.click();
    await settle();
    expect(rows()).toBe(1);

    q('tag-filter-all')!.click();
    await settle();
    expect(rows()).toBe(3);
  });

  it('CP-07-05: removing a chip while editing sends the remaining tags only', async () => {
    const updateTask = vi.fn(async (id: number): Promise<TaskResult> => ({
      ok: true,
      task: task(id),
    }));
    const { q, settle } = await render([task(1, { tags: ['api', 'infra'] })], { updateTask });
    q('task-edit')!.click();
    await settle();
    q('tag-remove')!.click();
    await settle();
    q('task-save')!.click();
    await settle();
    expect(updateTask).toHaveBeenCalledWith(1, expect.objectContaining({ tags: ['infra'] }));
  });

  it('CP-07-06: typing a prefix suggests existing tags and picking one adds it', async () => {
    const { q, el, settle } = await render([]);
    q('new-task')!.click();
    await settle();
    type(q<HTMLInputElement>('tag-input')!, 'inf');
    await settle();
    const suggestions = [...el.querySelectorAll<HTMLElement>('[data-testid="tag-suggestion"]')];
    expect(suggestions.map((s) => s.textContent?.trim())).toEqual(['#infra', '#infrared']);

    suggestions[0].click();
    await settle();
    expect(el.querySelectorAll('[data-testid="tag-chip"]')).toHaveLength(1);
    expect(q('tag-suggestions')).toBeNull();
  });

  it('CP-06-01: a repeating task shows the "Semanal · viernes" chip and the tab lists its series', async () => {
    const weekly = task(1, {
      title: 'Revisar backups',
      dueDate: '2999-01-04',
      seriesId: 3,
      recurrence: { kind: 'weekly', weekday: 5 },
    });
    const { el, q, settle } = await render([weekly, task(2)]);
    expect(el.querySelectorAll('[data-testid="task-repeat-chip"]')).toHaveLength(1);
    expect(q('task-repeat-chip')!.textContent).toContain('Semanal · viernes');

    q('tab-series')!.click();
    await settle();
    expect(el.querySelectorAll('[data-testid="series-row"]')).toHaveLength(1);
    expect(el.textContent).toContain('Semanal · viernes');
  });

  it('CP-06-12: a weekly rule without day is rejected in the form with a Spanish message', async () => {
    const { q, settle, createTask } = await render([]);
    q('new-task')!.click();
    await settle();
    const title = q<HTMLInputElement>('task-title')!;
    title.value = 'Revisar backups';
    title.dispatchEvent(new Event('input'));
    const kind = q<HTMLSelectElement>('recurrence-kind')!;
    kind.value = 'weekly';
    kind.dispatchEvent(new Event('change'));
    await settle();
    q('task-save')!.click();
    await settle();
    expect(createTask).not.toHaveBeenCalled();
    expect(q('task-error')!.textContent).toContain('Elige el día de la semana');
  });

  it('CP-06-12: a repeating task without start date is rejected with a clear message', async () => {
    const { q, settle, createTask } = await render([]);
    q('new-task')!.click();
    await settle();
    const title = q<HTMLInputElement>('task-title')!;
    title.value = 'Diaria';
    title.dispatchEvent(new Event('input'));
    const kind = q<HTMLSelectElement>('recurrence-kind')!;
    kind.value = 'daily';
    kind.dispatchEvent(new Event('change'));
    await settle();
    q('task-save')!.click();
    await settle();
    expect(createTask).not.toHaveBeenCalled();
    expect(q('task-error')!.textContent).toContain('fecha de inicio');
  });

  it('CP-06-10: editing a series from the tab opens the form with its current rule', async () => {
    const weekly = task(1, {
      dueDate: '2999-01-04',
      seriesId: 3,
      recurrence: { kind: 'weekly', weekday: 5 },
    });
    const { q, settle } = await render([weekly]);
    q('tab-series')!.click();
    await settle();
    q('series-edit')!.click();
    await settle();
    expect(q<HTMLSelectElement>('recurrence-kind')!.value).toBe('weekly');
    expect(q<HTMLSelectElement>('recurrence-weekday')!.value).toBe('5');
  });

  it('CP-18-01: the form sends the chosen reminder with the task', async () => {
    const { q, settle, createTask } = await render([]);
    q('new-task')!.click();
    await settle();
    const title = q<HTMLInputElement>('task-title')!;
    title.value = 'Llamar al dentista';
    title.dispatchEvent(new Event('input'));
    const reminder = q<HTMLInputElement>('task-reminder')!;
    reminder.value = '2026-03-10T09:00';
    reminder.dispatchEvent(new Event('input'));
    q('task-save')!.click();
    await settle();

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ reminderAt: '2026-03-10T09:00' }),
    );
  });

  it('CP-18-01: editing a task shows its reminder and "Quitar recordatorio" clears it', async () => {
    const updateTask = vi.fn(async (id: number): Promise<TaskResult> => ({
      ok: true,
      task: task(id),
    }));
    const { q, settle } = await render([task(1, { reminderAt: '2026-03-10T09:00' })], {
      updateTask,
    });
    q('task-edit')!.click();
    await settle();
    expect(q<HTMLInputElement>('task-reminder')!.value).toBe('2026-03-10T09:00');

    q('task-reminder-clear')!.click();
    await settle();
    q('task-save')!.click();
    await settle();

    expect(updateTask).toHaveBeenCalledWith(1, expect.objectContaining({ reminderAt: null }));
  });

  it('CP-18-02: a rejected reminder shows a Spanish message', async () => {
    const createTask = vi.fn(async (): Promise<TaskResult> => ({
      ok: false,
      error: 'invalid_reminder',
    }));
    const { q, settle } = await render([], { createTask });
    q('new-task')!.click();
    await settle();
    const title = q<HTMLInputElement>('task-title')!;
    title.value = 'Algo';
    title.dispatchEvent(new Event('input'));
    q('task-save')!.click();
    await settle();

    expect(q('task-error')?.textContent).toContain('recordatorio no es válida');
  });

  it('CP-18-09: a task with a reminder shows when, and whether it was notified', async () => {
    const { el } = await render([
      task(1, { reminderAt: '2026-03-10T09:00' }),
      task(2, { reminderAt: '2026-03-10T10:00', reminderNotifiedAt: '2026-03-10T13:00:00.000Z' }),
    ]);
    const chips = [...el.querySelectorAll('[data-testid="task-reminder-chip"]')].map((c) =>
      c.textContent?.trim(),
    );
    expect(chips).toEqual(['Recordatorio 2026-03-10 09:00', 'Notificado · 2026-03-10 10:00']);
  });
});
