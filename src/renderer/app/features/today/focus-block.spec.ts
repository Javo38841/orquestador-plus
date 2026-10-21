import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type { Task } from '../../../../shared/tasks';
import { DESKTOP_API } from '../../core/desktop-api';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { TasksStore } from '../tasks/tasks.store';
import { FocusBlock } from './focus-block';

const task = (id: number): Task => ({
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
});

async function render() {
  const api = {
    listTasks: async () => [task(1)],
    listTags: async () => [],
    listProjects: async () => [],
  } as unknown as OrquestadorApi;
  await TestBed.configureTestingModule({
    imports: [
      FocusBlock,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
    providers: [{ provide: DESKTOP_API, useValue: api }],
  }).compileComponents();
  await TestBed.inject(TasksStore).load();
  const fixture = TestBed.createComponent(FocusBlock);
  fixture.componentRef.setInput('tasks', [task(1)]);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`);
  const settle = () => {
    fixture.detectChanges();
  };
  return { el, q, settle };
}

describe('FocusBlock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('CP-17-06: starting without a task shows the "choose a task" message', async () => {
    const { q, settle } = await render();
    q('focus-start')!.click();
    settle();
    expect(q('focus-needs-task')!.textContent).toContain('Elige una tarea');
    expect(q('focus-state')!.textContent).toContain('Detenido');
  });

  it('CP-17-08: texts come from es.json and controls are real buttons usable by keyboard', async () => {
    const { el, q, settle } = await render();
    expect(el.textContent).toContain('Enfoque');
    expect(q('focus-clock')!.textContent).toContain('25:00');

    const select = q<HTMLSelectElement>('focus-task')!;
    select.value = '1';
    select.dispatchEvent(new Event('change'));
    settle();

    const start = q<HTMLButtonElement>('focus-start')!;
    expect(start.tagName).toBe('BUTTON');
    expect(start.textContent).toContain('Iniciar');
    start.click();
    settle();
    expect(q('focus-state')!.textContent).toContain('En curso');
    expect(q('focus-pause')!.tagName).toBe('BUTTON');
    expect(q('focus-reset')!.tagName).toBe('BUTTON');

    q('focus-pause')!.click();
    settle();
    expect(q('focus-state')!.textContent).toContain('En pausa');
    q('focus-reset')!.click();
    settle();
    expect(q('focus-state')!.textContent).toContain('Detenido');
  });

  it('CP-17-05: shows the finished notice at 00:00', async () => {
    const { q, settle } = await render();
    const select = q<HTMLSelectElement>('focus-task')!;
    select.value = '1';
    select.dispatchEvent(new Event('change'));
    settle();
    q('focus-start')!.click();
    vi.advanceTimersByTime(25 * 60 * 1000 + 1000);
    settle();
    expect(q('focus-clock')!.textContent).toContain('00:00');
    expect(q('focus-finished')!.textContent).toContain('terminada');
  });
});
