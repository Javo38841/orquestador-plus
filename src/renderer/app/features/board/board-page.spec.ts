import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type { Task, TaskResult } from '../../../../shared/tasks';
import { DESKTOP_API } from '../../core/desktop-api';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { BoardPage } from './board-page';

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

const recent = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString();
const old = () => new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

async function render(stored: Task[]) {
  const setTaskStatus = vi.fn(async (id: number, status: Task['status']): Promise<TaskResult> => ({
    ok: true,
    task: {
      ...stored.find((t) => t.id === id)!,
      status,
      completedAt: status === 'done' ? new Date().toISOString() : null,
    },
  }));
  const api = {
    listTasks: async () => stored,
    listTags: async () => ['infra', 'ui'],
    listProjects: async () => [
      { id: 1, name: 'api' },
      { id: 2, name: 'web' },
    ],
    setTaskStatus,
  } as unknown as OrquestadorApi;
  await TestBed.configureTestingModule({
    imports: [
      BoardPage,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
    providers: [{ provide: DESKTOP_API, useValue: api }],
  }).compileComponents();
  const fixture = TestBed.createComponent(BoardPage);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const column = (status: string) =>
    el.querySelector<HTMLElement>(`[data-testid="board-column"][data-status="${status}"]`)!;
  const titles = (status: string) =>
    [...column(status).querySelectorAll('[data-testid="board-card"] p')].map((p) =>
      p.textContent!.trim(),
    );
  const chip = (id: string, text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>(`[data-testid="${id}"]`)].find((b) =>
      b.textContent!.includes(text),
    )!;
  return { fixture, el, settle, column, titles, chip, setTaskStatus };
}

const sample = () => [
  task(1, { title: 'Suelta uno' }),
  task(2, { title: 'Api en curso', status: 'in_progress', projectId: 1, projectName: 'api' }),
  task(3, { title: 'Web infra', projectId: 2, projectName: 'web', tags: ['infra'] }),
  task(4, { title: 'Api infra', projectId: 1, projectName: 'api', tags: ['infra'] }),
  task(5, { title: 'Hecha reciente', status: 'done', completedAt: recent() }),
  task(6, { title: 'Hecha vieja', status: 'done', completedAt: old() }),
];

describe('BoardPage', () => {
  it('CP-04-01: shows the three columns with counts and each task in its column', async () => {
    const { el, titles, column } = await render(sample());
    const heads = [...el.querySelectorAll('[data-testid="board-column"] h2 span')].map((h) =>
      h.textContent!.trim(),
    );
    expect(heads).toEqual(['Por hacer', '3', 'En curso', '1', 'Hecho', '1']);
    expect(titles('todo')).toEqual(['Suelta uno', 'Web infra', 'Api infra']);
    expect(titles('in_progress')).toEqual(['Api en curso']);
    expect(titles('done')).toEqual(['Hecha reciente']);
    expect(column('todo').textContent).toContain('Suelta');
  });

  it('CP-04-03: moving a card to Hecho completes it and moving it out sets it pending', async () => {
    const { el, settle, setTaskStatus, titles } = await render(sample());
    const open = async (title: string, target: string) => {
      const card = [...el.querySelectorAll<HTMLElement>('[data-testid="board-card"]')].find((c) =>
        c.textContent!.includes(title),
      )!;
      card.querySelector<HTMLButtonElement>('[data-testid="board-move"]')!.click();
      await settle();
      card
        .querySelector<HTMLButtonElement>(
          `[data-testid="board-move-option"][data-status="${target}"]`,
        )!
        .click();
      await settle();
    };
    await open('Suelta uno', 'done');
    expect(setTaskStatus).toHaveBeenLastCalledWith(1, 'done');
    expect(titles('done')).toContain('Suelta uno');

    await open('Suelta uno', 'todo');
    expect(setTaskStatus).toHaveBeenLastCalledWith(1, 'todo');
    expect(titles('todo')).toContain('Suelta uno');
  });

  it('CP-04-04: "Mover a…" is a keyboard-operable menu that excludes the current column and closes with Escape', async () => {
    const { el, settle, fixture } = await render(sample());
    const card = el.querySelector<HTMLElement>('[data-testid="board-card"]')!;
    const trigger = card.querySelector<HTMLButtonElement>('[data-testid="board-move"]')!;
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.textContent).toContain('Mover a…');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');

    trigger.click();
    await settle();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const items = [...card.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(items.map((i) => i.tagName)).toEqual(['BUTTON', 'BUTTON']);
    expect(items.map((i) => i.dataset['status'])).toEqual(['in_progress', 'done']);

    card
      .querySelector('[role="menuitem"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(card.querySelector('[role="menu"]')).toBeNull();
  });

  it('CP-05-01: "Activas" shows every task including loose ones; a project chip shows only that project', async () => {
    const { settle, titles, chip } = await render(sample());
    expect(titles('todo')).toContain('Suelta uno');

    chip('board-filter-project', 'api').click();
    await settle();
    expect(titles('todo')).toEqual(['Api infra']);
    expect(titles('in_progress')).toEqual(['Api en curso']);
    expect(titles('done')).toEqual([]);

    chip('board-filter-active', 'Activas').click();
    await settle();
    expect(titles('todo')).toContain('Suelta uno');
  });

  it('CP-05-02: tag chips filter the board and combine with the project filter', async () => {
    const { settle, titles, chip } = await render(sample());
    chip('board-filter-tag', '#infra').click();
    await settle();
    expect(titles('todo')).toEqual(['Web infra', 'Api infra']);
    expect(titles('in_progress')).toEqual([]);

    chip('board-filter-project', 'web').click();
    await settle();
    expect(titles('todo')).toEqual(['Web infra']);
  });

  it('CP-05-03: "Hecho" leaves out tasks completed more than 7 days ago', async () => {
    const { titles } = await render(sample());
    expect(titles('done')).toEqual(['Hecha reciente']);
  });
});
