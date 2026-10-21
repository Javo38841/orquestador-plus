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
  createdAt: '2026-03-01T10:00:00.000Z',
  ...extra,
});

async function render(stored: Task[]) {
  const deleteTask = vi.fn(async () => true);
  const createTask = vi.fn(async (input): Promise<TaskResult> => ({
    ok: true,
    task: task(50, { title: input.title }),
  }));
  const api = {
    listTasks: async () => stored,
    listProjects: async () => [{ id: 1, name: 'api-gateway' }],
    createTask,
    deleteTask,
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
    providers: [{ provide: DESKTOP_API, useValue: api }],
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
});
