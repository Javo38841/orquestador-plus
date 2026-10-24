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
  hiddenFromTodayAt: null,
});

async function render(saved = 25) {
  const setFocusMinutes = vi.fn(async (minutes: number) => minutes);
  const api = {
    getFocusMinutes: async () => saved,
    setFocusMinutes,
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
  await vi.advanceTimersByTimeAsync(0);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`);
  const settle = () => {
    fixture.detectChanges();
  };
  return { el, q, settle, setFocusMinutes };
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

  it('CP-03-16: the card shows the session, big clock, progress bar and Pausar/Reiniciar', async () => {
    const { q, settle } = await render();
    expect(q('focus-session')!.textContent).toContain('SESIÓN 1 DE 4');
    expect(q('focus-progress')!.getAttribute('aria-valuenow')).toBe('0');
    const select = q<HTMLSelectElement>('focus-task')!;
    select.value = '1';
    select.dispatchEvent(new Event('change'));
    q('focus-start')!.click();
    vi.advanceTimersByTime(5 * 60 * 1000);
    settle();
    expect(q('focus-progress')!.getAttribute('aria-valuenow')).toBe('20');
    expect(q('focus-pause')!.textContent).toContain('Pausar');
    expect(q('focus-pause')!.classList).toContain('bg-accent');
    expect(q('focus-reset')!.textContent).toContain('Reiniciar');
  });

  const startSession = (q: <T extends HTMLElement>(id: string) => T | null) => {
    const select = q<HTMLSelectElement>('focus-task')!;
    select.value = '1';
    select.dispatchEvent(new Event('change'));
    q('focus-start')!.click();
  };

  const type = (q: (id: string) => HTMLElement | null, value: string) => {
    const input = q('focus-minutes') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('change'));
  };

  it('CP-17-10: − and + change the duration by 5 minutes and the clock shows it', async () => {
    const { q, settle } = await render();
    q('focus-plus')!.click();
    settle();
    expect(q('focus-clock')!.textContent).toContain('30:00');
    expect((q('focus-minutes') as HTMLInputElement).value).toBe('30');
    q('focus-minus')!.click();
    q('focus-minus')!.click();
    settle();
    expect(q('focus-clock')!.textContent).toContain('20:00');
  });

  it('CP-17-11: the buttons stop at 180 and at 1', async () => {
    const { q, settle } = await render(180);
    q('focus-plus')!.click();
    settle();
    expect(q('focus-clock')!.textContent).toContain('180:00');
    type(q, '3');
    q('focus-minus')!.click();
    settle();
    expect(q('focus-clock')!.textContent).toContain('01:00');
  });

  it('CP-17-12: a shortcut sets the duration', async () => {
    const { q, settle, el } = await render();
    const shortcuts = Array.from(
      el.querySelectorAll<HTMLButtonElement>('[data-testid="focus-shortcut"]'),
    );
    expect(shortcuts.map((b) => b.textContent!.trim())).toEqual([
      '15 min',
      '25 min',
      '30 min',
      '45 min',
      '60 min',
    ]);
    shortcuts[3].click();
    settle();
    expect(q('focus-clock')!.textContent).toContain('45:00');
  });

  it('CP-17-13: typing an integer from 1 to 180 applies it', async () => {
    const { q, settle, setFocusMinutes } = await render();
    type(q, '90');
    settle();
    expect(q('focus-clock')!.textContent).toContain('90:00');
    expect(q('focus-minutes-error')).toBeNull();
    expect(setFocusMinutes).toHaveBeenCalledWith(90);
  });

  it('CP-17-14: invalid text is not applied and shows an error in Spanish', async () => {
    const { q, settle, setFocusMinutes } = await render();
    for (const bad of ['', 'abc', '1.5', '0', '-5', '181', '10x']) {
      type(q, bad);
      settle();
      expect(q('focus-clock')!.textContent).toContain('25:00');
      expect(q('focus-minutes-error')!.textContent).toContain('número entero de 1 a 180');
    }
    expect(setFocusMinutes).not.toHaveBeenCalled();
    type(q, '20');
    settle();
    expect(q('focus-minutes-error')).toBeNull();
  });

  it('CP-17-15: arrow up and down change the duration by one minute', async () => {
    const { q, settle } = await render();
    const input = q('focus-minutes')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    settle();
    expect(q('focus-clock')!.textContent).toContain('26:00');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    settle();
    expect(q('focus-clock')!.textContent).toContain('24:00');
  });

  it('CP-17-16: the progress bar is computed over the chosen duration', async () => {
    const { q, settle } = await render();
    q('focus-plus')!.click();
    settle();
    startSession(q);
    vi.advanceTimersByTime(6 * 60 * 1000);
    settle();
    expect(q('focus-clock')!.textContent).toContain('24:00');
    expect(q('focus-progress')!.getAttribute('aria-valuenow')).toBe('20');
  });

  it('CP-17-17: Reiniciar goes back to the chosen duration', async () => {
    const { q, settle } = await render();
    q<HTMLButtonElement>('focus-shortcut')!.click();
    settle();
    startSession(q);
    vi.advanceTimersByTime(5000);
    q('focus-reset')!.click();
    settle();
    expect(q('focus-clock')!.textContent).toContain('15:00');
    expect(q('focus-state')!.textContent).toContain('Detenido');
  });

  it('CP-17-18: the duration controls are disabled while running or paused', async () => {
    const { q, settle, el } = await render();
    startSession(q);
    settle();
    const controls = () => [
      ...Array.from(el.querySelectorAll<HTMLButtonElement>('[data-testid="focus-shortcut"]')),
      q<HTMLButtonElement>('focus-minus')!,
      q<HTMLButtonElement>('focus-plus')!,
      q<HTMLInputElement>('focus-minutes')!,
    ];
    expect(controls().every((c) => c.disabled)).toBe(true);
    q('focus-pause')!.click();
    settle();
    expect(controls().every((c) => c.disabled)).toBe(true);
    expect(q('focus-clock')!.textContent).not.toContain('30:00');
  });

  it('CP-17-20: shows the saved duration when the block loads', async () => {
    const { q } = await render(45);
    expect(q('focus-clock')!.textContent).toContain('45:00');
    expect((q('focus-minutes') as HTMLInputElement).value).toBe('45');
  });

  it('CP-17-23: +5 min lengthens a running or paused session and recalculates the bar', async () => {
    const { q, settle } = await render();
    expect(q('focus-extend')).toBeNull();
    startSession(q);
    vi.advanceTimersByTime(5 * 60 * 1000);
    settle();
    q('focus-extend')!.click();
    settle();
    expect(q('focus-extend')!.textContent).toContain('+5 min');
    expect(q('focus-clock')!.textContent).toContain('25:00');
    expect(q('focus-state')!.textContent).toContain('En curso');
    expect(q('focus-progress')!.getAttribute('aria-valuenow')).toBe('17');
    q('focus-pause')!.click();
    settle();
    q('focus-extend')!.click();
    settle();
    expect(q('focus-clock')!.textContent).toContain('30:00');
    expect(q('focus-state')!.textContent).toContain('En pausa');
  });

  it('CP-17-24: +5 min is disabled when the session would pass 180 minutes', async () => {
    const { q, settle } = await render(178);
    startSession(q);
    settle();
    expect(q<HTMLButtonElement>('focus-extend')!.disabled).toBe(true);
  });

  it('CP-17-25: +5 min is not shown when stopped, and Reiniciar drops the extra minutes', async () => {
    const { q, settle, setFocusMinutes } = await render();
    expect(q('focus-extend')).toBeNull();
    startSession(q);
    settle();
    q('focus-extend')!.click();
    q('focus-reset')!.click();
    settle();
    expect(q('focus-extend')).toBeNull();
    expect(q('focus-clock')!.textContent).toContain('25:00');
    expect(setFocusMinutes).not.toHaveBeenCalled();
  });

  it('CP-17-22: the new controls use es.json texts and are reachable with Tab', async () => {
    const { q, el } = await render();
    expect(q('focus-minus')!.getAttribute('aria-label')).toBe('Restar 5 minutos');
    expect(q('focus-plus')!.getAttribute('aria-label')).toBe('Sumar 5 minutos');
    expect(el.querySelector('label[for="focus-minutes"]')!.textContent).toContain(
      'Duración en minutos',
    );
    const focusable = [
      q('focus-minus')!,
      q('focus-minutes')!,
      q('focus-plus')!,
      ...Array.from(el.querySelectorAll<HTMLElement>('[data-testid="focus-shortcut"]')),
    ];
    for (const control of focusable) {
      expect(control.tabIndex).toBeGreaterThanOrEqual(0);
      expect(['BUTTON', 'INPUT']).toContain(control.tagName);
    }
  });
});
