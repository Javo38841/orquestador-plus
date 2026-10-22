import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { BoardSelection } from '../../../../shared/board';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type { ProjectResult, Task, TaskResult } from '../../../../shared/tasks';
import { PROJECT_NAME_MAX_LENGTH } from '../../../../shared/tasks';
import { DESKTOP_API } from '../../core/desktop-api';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { TasksStore } from '../tasks/tasks.store';
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

interface Options {
  stored?: { id: number; name: string }[];
  board?: BoardSelection;
  create?: (name: string) => Promise<ProjectResult>;
}

async function render(stored: Task[], options: Options = {}) {
  const projects = options.stored ?? [
    { id: 1, name: 'api' },
    { id: 2, name: 'web' },
  ];
  const setBoardProject = vi.fn(async (selection: BoardSelection) => selection);
  const createProject = vi.fn(
    options.create ??
      (async (name: string): Promise<ProjectResult> => {
        const project = { id: projects.length + 10, name: name.trim() };
        projects.push(project);
        return { ok: true, project };
      }),
  );
  const setTaskStatus = vi.fn(async (id: number, status: Task['status']): Promise<TaskResult> => ({
    ok: true,
    task: {
      ...stored.find((t) => t.id === id)!,
      status,
      completedAt: status === 'done' ? new Date().toISOString() : null,
    },
  }));
  const api = {
    listTasks: async () => [...stored],
    listTags: async () => ['infra', 'ui'],
    listProjects: async () => [...projects],
    createProject,
    getBoardProject: async () => options.board ?? 'general',
    setBoardProject,
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
  const select = () => el.querySelector<HTMLSelectElement>('[data-testid="board-select"]')!;
  const pick = async (value: string) => {
    select().value = value;
    select().dispatchEvent(new Event('change'));
    await settle();
  };
  const items = () =>
    [...el.querySelectorAll('[data-testid="board-project-item"]')].map((i) =>
      i.textContent!.trim(),
    );
  const create = async (name: string) => {
    const input = el.querySelector<HTMLInputElement>('[data-testid="project-name"]')!;
    input.value = name;
    input.dispatchEvent(new Event('input'));
    el.querySelector<HTMLFormElement>('[data-testid="project-form"]')!.dispatchEvent(
      new Event('submit'),
    );
    await settle();
    await settle();
  };
  const error = () => el.querySelector('[data-testid="project-error"]')?.textContent?.trim();
  return {
    fixture,
    el,
    settle,
    column,
    titles,
    chip,
    setTaskStatus,
    select,
    pick,
    items,
    create,
    error,
    setBoardProject,
    createProject,
  };
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

  it('CP-04-05: the "Proyectos" section lists every project', async () => {
    const { el, items } = await render(sample());
    expect(el.querySelector('[data-testid="board-projects-panel"] h2')!.textContent).toContain(
      'Proyectos',
    );
    expect(items()).toEqual(['api', 'web']);
  });

  it('CP-04-09: the combo box offers "General" first and selected, then one option per project', async () => {
    const { select } = await render(sample());
    expect([...select().options].map((o) => o.textContent!.trim())).toEqual([
      'General',
      'Sueltas',
      'api',
      'web',
    ]);
    expect(select().value).toBe('general');
  });

  it('CP-05-04: "General" shows every task including loose ones; a project shows only its own', async () => {
    const { pick, titles } = await render(sample());
    expect(titles('todo')).toContain('Suelta uno');

    await pick('1');
    expect(titles('todo')).toEqual(['Api infra']);
    expect(titles('in_progress')).toEqual(['Api en curso']);
    expect(titles('done')).toEqual([]);

    await pick('general');
    expect(titles('todo')).toContain('Suelta uno');
  });

  it('CP-04-10: choosing a project in the side panel is the same as choosing it in the combo box', async () => {
    const { el, settle, select, titles, setBoardProject } = await render(sample());
    el.querySelectorAll<HTMLButtonElement>('[data-testid="board-project-item"]')[1]!.click();
    await settle();
    expect(select().value).toBe('2');
    expect(titles('todo')).toEqual(['Web infra']);
    expect(setBoardProject).toHaveBeenLastCalledWith({ projectId: 2 });
  });

  it('CP-05-05: project chips are gone; tag chips still filter and combine with the chosen board', async () => {
    const { el, settle, titles, chip, pick } = await render(sample());
    expect(el.querySelector('[data-testid="board-filter-project"]')).toBeNull();
    expect(el.querySelector('[data-testid="board-filter-active"]')).toBeNull();

    chip('board-filter-tag', '#infra').click();
    await settle();
    expect(titles('todo')).toEqual(['Web infra', 'Api infra']);
    expect(titles('in_progress')).toEqual([]);

    await pick('2');
    expect(titles('todo')).toEqual(['Web infra']);
  });

  it('CP-04-06: creating a project adds it to the list and the combo box and clears the form', async () => {
    const { el, create, items, select, error, createProject } = await render(sample());
    await create('  nuevo  ');
    expect(createProject).toHaveBeenCalledWith('nuevo');
    expect(items()).toContain('nuevo');
    expect([...select().options].map((o) => o.textContent!.trim())).toContain('nuevo');
    expect(error()).toBeUndefined();
    expect(el.querySelector<HTMLInputElement>('[data-testid="project-name"]')!.value).toBe('');
  });

  it('CP-04-07: an empty, blank or too long name creates nothing and shows an error', async () => {
    const { create, items, error, createProject } = await render(sample());
    await create('');
    expect(error()).toBe('Escribe un nombre para el proyecto.');
    await create('   ');
    expect(error()).toBe('Escribe un nombre para el proyecto.');
    await create('x'.repeat(PROJECT_NAME_MAX_LENGTH + 1));
    expect(error()).toBe(`El nombre no puede superar ${PROJECT_NAME_MAX_LENGTH} caracteres.`);
    expect(createProject).not.toHaveBeenCalled();
    expect(items()).toEqual(['api', 'web']);
  });

  it('CP-04-08: a name that already exists shows an error and does not duplicate it', async () => {
    const { create, items, error } = await render(sample(), {
      create: async () => ({ ok: false, error: 'duplicate_project' }),
    });
    await create('WEB');
    expect(error()).toBe('Ya existe un proyecto con ese nombre.');
    expect(items()).toEqual(['api', 'web']);
  });

  it('CP-04-10: the new-project form is a real form submitted with Enter, and the combo box is a native select', async () => {
    const { el, select } = await render(sample());
    const form = el.querySelector<HTMLFormElement>('[data-testid="project-form"]')!;
    expect(form.tagName).toBe('FORM');
    expect(form.querySelector('button[type="submit"]')).not.toBeNull();
    expect(form.querySelector('input')!.id).toBeTruthy();
    expect(select().tagName).toBe('SELECT');
    expect(el.querySelector(`label[for="${select().id}"]`)).not.toBeNull();
    for (const item of el.querySelectorAll('[data-testid="board-project-item"]')) {
      expect(item.tagName).toBe('BUTTON');
    }
  });

  it('CP-04-11: if the chosen project no longer exists the board goes back to "General"', async () => {
    const { select, titles, setBoardProject } = await render(sample(), {
      board: { projectId: 99 },
    });
    expect(select().value).toBe('general');
    expect(titles('todo')).toContain('Suelta uno');
    expect(setBoardProject).toHaveBeenCalledWith('general');
  });

  it('CP-04-12: the last chosen board is restored on open and every change is saved', async () => {
    const { select, titles, pick, setBoardProject } = await render(sample(), {
      board: { projectId: 2 },
    });
    expect(select().value).toBe('2');
    expect(titles('todo')).toEqual(['Web infra']);
    await pick('1');
    expect(setBoardProject).toHaveBeenLastCalledWith({ projectId: 1 });
    await pick('general');
    expect(setBoardProject).toHaveBeenLastCalledWith('general');
  });

  it('CP-05-03: "Hecho" leaves out tasks completed more than 7 days ago', async () => {
    const { titles } = await render(sample());
    expect(titles('done')).toEqual(['Hecha reciente']);
  });

  describe('"Sueltas"', () => {
    const loose = () => [
      ...sample(),
      task(7, { title: 'Suelta infra', tags: ['infra'] }),
      task(8, { title: 'Suelta curso', status: 'in_progress' }),
    ];
    const counts = (el: HTMLElement) =>
      [...el.querySelectorAll('[data-testid="board-count"]')].map((c) => c.textContent!.trim());

    it('CP-04-13: the combo box offers General (default), Sueltas, then projects, even with no projects', async () => {
      const { select } = await render(sample());
      const values = [...select().options].map((o) => o.value);
      expect(values).toEqual(['general', 'loose', '1', '2']);
      expect(select().value).toBe('general');
      TestBed.resetTestingModule();
      const empty = await render(sample(), { stored: [] });
      expect([...empty.select().options].map((o) => o.textContent!.trim())).toEqual([
        'General',
        'Sueltas',
      ]);
    });

    it('CP-05-06: shows only tasks without a project, with the three columns and their counts', async () => {
      const { el, pick, titles } = await render(loose());
      await pick('loose');
      expect(titles('todo')).toEqual(['Suelta uno', 'Suelta infra']);
      expect(titles('in_progress')).toEqual(['Suelta curso']);
      expect(titles('done')).toEqual(['Hecha reciente']);
      expect(counts(el)).toEqual(['2', '1', '1']);
    });

    it('CP-05-07: tag chips combine with "Sueltas"', async () => {
      const { settle, chip, pick, titles } = await render(loose());
      await pick('loose');
      chip('board-filter-tag', '#infra').click();
      await settle();
      expect(titles('todo')).toEqual(['Suelta infra']);
      expect(titles('in_progress')).toEqual([]);
    });

    it('CP-05-08: with no loose tasks the three columns are empty with count 0', async () => {
      const onlyProjects = [task(1, { projectId: 1, projectName: 'api' })];
      const { el, pick, titles } = await render(onlyProjects);
      await pick('loose');
      expect(titles('todo')).toEqual([]);
      expect(counts(el)).toEqual(['0', '0', '0']);
    });

    it('CP-05-09: a task that gets a project leaves "Sueltas" and one that loses it appears', async () => {
      const tasks = loose();
      const { fixture, pick, titles } = await render(tasks);
      await pick('loose');
      expect(titles('todo')).toContain('Suelta uno');
      const store = TestBed.inject(TasksStore);
      const i1 = tasks.findIndex((t) => t.id === 1);
      const i4 = tasks.findIndex((t) => t.id === 4);
      tasks[i1] = { ...tasks[i1]!, projectId: 1, projectName: 'api' };
      tasks[i4] = { ...tasks[i4]!, projectId: null, projectName: null };
      await store.load();
      fixture.detectChanges();
      expect(titles('todo')).not.toContain('Suelta uno');
      expect(titles('todo')).toContain('Api infra');
    });

    it('CP-04-14: choosing "Sueltas" is saved and restored on open', async () => {
      const first = await render(loose());
      await first.pick('loose');
      expect(first.setBoardProject).toHaveBeenLastCalledWith('loose');
      TestBed.resetTestingModule();
      const reopened = await render(loose(), { board: 'loose' });
      expect(reopened.select().value).toBe('loose');
      expect(reopened.titles('todo')).toEqual(['Suelta uno', 'Suelta infra']);
    });

    it('CP-04-16: "Sueltas" is an option of a native, labelled select, so the keyboard reaches it', async () => {
      const { el, select } = await render(sample());
      expect(select().tagName).toBe('SELECT');
      expect(el.querySelector(`label[for="${select().id}"]`)).not.toBeNull();
      const option = [...select().options].find((o) => o.value === 'loose')!;
      expect(option.disabled).toBe(false);
      expect(option.textContent!.trim()).toBe('Sueltas');
    });
  });
});
