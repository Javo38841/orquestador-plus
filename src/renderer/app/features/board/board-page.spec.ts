import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import es from '../../../../../locales/es.json';
import type { BoardSelection } from '../../../../shared/board';
import type { InboxItem } from '../../../../shared/inbox';
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
  hiddenFromTodayAt: null,
  ...extra,
});

const recent = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString();
const old = () => new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

interface Options {
  stored?: { id: number; name: string }[];
  board?: BoardSelection;
  create?: (name: string) => Promise<ProjectResult>;
  inbox?: InboxItem[];
  tags?: string[];
  panelOpen?: boolean;
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
  const setTaskStatus = vi.fn(async (id: number, status: Task['status']): Promise<TaskResult> => {
    const index = stored.findIndex((t) => t.id === id);
    const updated = {
      ...stored[index]!,
      status,
      completedAt: status === 'done' ? new Date().toISOString() : null,
    };
    // The store keeps its own copy, but a later reload must see the change.
    stored[index] = updated;
    return { ok: true, task: updated };
  });
  const inbox = options.inbox ?? [];
  const createTask = vi.fn(
    async (input: { title: string; projectId: number | null; tags?: string[] }) => {
      const created = task(100 + stored.length, {
        title: input.title,
        projectId: input.projectId,
        projectName: projects.find((p) => p.id === input.projectId)?.name ?? null,
        tags: input.tags ?? [],
      });
      stored.push(created);
      return { ok: true as const, task: created };
    },
  );
  const convertInboxItem = vi.fn(async (id: number, { input }: { input: { title: string } }) => {
    inbox.splice(
      inbox.findIndex((i) => i.id === id),
      1,
    );
    const created = task(200 + id, { title: input.title });
    stored.push(created);
    return { ok: true as const, type: 'task' as const, task: created };
  });
  const discardInboxItem = vi.fn(async (id: number) => {
    inbox.splice(
      inbox.findIndex((i) => i.id === id),
      1,
    );
    return true;
  });
  const setBoardPanelOpen = vi.fn(async (open: boolean) => open);
  const api = {
    listInbox: async () => [...inbox],
    createTask,
    convertInboxItem,
    discardInboxItem,
    getBoardPanelOpen: async () => options.panelOpen ?? true,
    setBoardPanelOpen,
    listTasks: async () => [...stored],
    listTags: async () => options.tags ?? ['infra', 'ui'],
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
    [...column(status).querySelectorAll('[data-testid="board-card-title"]')].map((p) =>
      p.textContent!.trim(),
    );
  const chip = (id: string, text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>(`[data-testid="${id}"]`)].find((b) =>
      b.textContent!.includes(text),
    )!;
  const select = () => el.querySelector<HTMLButtonElement>('[data-testid="board-select"]')!;
  /** Value of the chosen board, as the combo box exposes it. */
  const current = () => select().dataset['value'];
  const optionEls = () => [
    ...el.querySelectorAll<HTMLElement>('[data-testid="board-select-option"]'),
  ];
  /** Opens the combo box and lists its options as `[value, label]`. */
  const comboOptions = async () => {
    if (optionEls().length === 0) {
      select().click();
      await settle();
    }
    return optionEls().map((o) => [o.dataset['value'], o.textContent!.trim()]);
  };
  const pick = async (value: string) => {
    await comboOptions();
    optionEls()
      .find((o) => o.dataset['value'] === value)!
      .click();
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
    current,
    options: comboOptions,
    pick,
    items,
    create,
    error,
    setBoardProject,
    createProject,
    createTask,
    convertInboxItem,
    discardInboxItem,
    setBoardPanelOpen,
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
  it('CP-04-01: shows the task columns with counts and each task in its column', async () => {
    const { el, titles, column } = await render(sample());
    const heads = [...el.querySelectorAll('[data-testid="board-column-title"]')].map((h) =>
      h.textContent!.replace(/\s+/g, ' ').trim(),
    );
    expect(heads).toEqual(['Entrantes · 0', 'Por hacer · 3', 'En curso · 1', 'Hecho · 1']);
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

  it('CP-04-04: "Mover a…" is a keyboard-operable menu that disables the current column and closes with Escape', async () => {
    const { el, settle, fixture } = await render(sample());
    const card = el.querySelector<HTMLElement>('[data-testid="board-card"]')!;
    const trigger = card.querySelector<HTMLButtonElement>('[data-testid="board-move"]')!;
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('aria-label')).toBe('Mover a…');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');

    trigger.click();
    await settle();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const items = [...card.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    expect(items.map((i) => i.tagName)).toEqual(['BUTTON', 'BUTTON', 'BUTTON']);
    expect(items.map((i) => i.dataset['status'])).toEqual(['todo', 'in_progress', 'done']);
    expect(items.map((i) => i.disabled)).toEqual([true, false, false]);

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
    const { current, options } = await render(sample());
    expect((await options()).map(([, label]) => label)).toEqual([
      'General',
      'Sueltas',
      'api',
      'web',
    ]);
    expect(current()).toBe('general');
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
    const { el, settle, current, titles, setBoardProject } = await render(sample());
    el.querySelectorAll<HTMLButtonElement>('[data-testid="board-project-item"]')[1]!.click();
    await settle();
    expect(current()).toBe('2');
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
    const { el, create, items, options, error, createProject } = await render(sample());
    await create('  nuevo  ');
    expect(createProject).toHaveBeenCalledWith('nuevo');
    expect(items()).toContain('nuevo');
    expect((await options()).map(([, label]) => label)).toContain('nuevo');
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

  it('CP-04-10: the new-project form is a real form submitted with Enter, ', async () => {
    const { el } = await render(sample());
    const form = el.querySelector<HTMLFormElement>('[data-testid="project-form"]')!;
    expect(form.tagName).toBe('FORM');
    expect(form.querySelector('button[type="submit"]')).not.toBeNull();
    expect(form.querySelector('input')!.id).toBeTruthy();
    for (const item of el.querySelectorAll('[data-testid="board-project-item"]')) {
      expect(item.tagName).toBe('BUTTON');
    }
  });

  it('CP-04-11: if the chosen project no longer exists the board goes back to "General"', async () => {
    const { current, titles, setBoardProject } = await render(sample(), {
      board: { projectId: 99 },
    });
    expect(current()).toBe('general');
    expect(titles('todo')).toContain('Suelta uno');
    expect(setBoardProject).toHaveBeenCalledWith('general');
  });

  it('CP-04-12: the last chosen board is restored on open and every change is saved', async () => {
    const { current, titles, pick, setBoardProject } = await render(sample(), {
      board: { projectId: 2 },
    });
    expect(current()).toBe('2');
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
      const { current, options } = await render(sample());
      expect((await options()).map(([value]) => value)).toEqual(['general', 'loose', '1', '2']);
      expect(current()).toBe('general');
      TestBed.resetTestingModule();
      const empty = await render(sample(), { stored: [] });
      expect((await empty.options()).map(([, label]) => label)).toEqual(['General', 'Sueltas']);
    });

    it('CP-05-06: shows only tasks without a project, with the three columns and their counts', async () => {
      const { el, pick, titles } = await render(loose());
      await pick('loose');
      expect(titles('todo')).toEqual(['Suelta uno', 'Suelta infra']);
      expect(titles('in_progress')).toEqual(['Suelta curso']);
      expect(titles('done')).toEqual(['Hecha reciente']);
      expect(counts(el)).toEqual(['0', '2', '1', '1']);
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
      expect(counts(el)).toEqual(['0', '0', '0', '0']);
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
      expect(reopened.current()).toBe('loose');
      expect(reopened.titles('todo')).toEqual(['Suelta uno', 'Suelta infra']);
    });

    it('CP-04-16: "Sueltas" is an option of the labelled combo box, so the keyboard reaches it', async () => {
      const { select, options } = await render(sample());
      expect(select().getAttribute('aria-label')).toContain('Tablero');
      expect(await options()).toContainEqual(['loose', 'Sueltas']);
    });
  });

  describe('story #73', () => {
    const report = (id: number, title: string, source: InboxItem['source'] = 'portal') =>
      ({ id, title, source, createdAt: '2026-03-01T10:00:00.000Z' }) as InboxItem;
    const key = (el: HTMLElement, name: string, init: KeyboardEventInit = {}) =>
      el.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, ...init }));
    const cardOf = (el: HTMLElement, title: string) =>
      [...el.querySelectorAll<HTMLElement>('[data-testid="board-card"]')].find((c) =>
        c.textContent!.includes(title),
      )!;
    const heads = (el: HTMLElement) =>
      [...el.querySelectorAll('[data-testid="board-column-title"]')].map((h) => ({
        text: h.textContent!.replace(/\s+/g, ' ').trim(),
        classes: h.className,
      }));

    it('CP-05-24: shows Entrantes, Por hacer, En curso and Hecho left to right, with count and color', async () => {
      const { el } = await render(sample(), { inbox: [report(1, 'a'), report(2, 'b')] });
      const h = heads(el);
      expect(h.map((x) => x.text)).toEqual([
        'Entrantes · 2',
        'Por hacer · 3',
        'En curso · 1',
        'Hecho · 1',
      ]);
      expect(
        h.map((x) =>
          x.classes.split(' ').find((c) => /^text-(warn|muted|accent|project-ink)$/.test(c)),
        ),
      ).toEqual(['text-warn', 'text-muted', 'text-project-ink', 'text-accent']);
      const order = [...el.querySelectorAll<HTMLElement>('[data-testid="board-column"]')].map(
        (c) => c.dataset['status'],
      );
      expect(order).toEqual(['inbox', 'todo', 'in_progress', 'done']);
    });

    it('CP-05-25: an empty column shows count 0 and an empty text; Hecho keeps the 7-day window', async () => {
      const { el, column, titles } = await render([]);
      expect(heads(el).map((x) => x.text)).toEqual([
        'Entrantes · 0',
        'Por hacer · 0',
        'En curso · 0',
        'Hecho · 0',
      ]);
      expect(column('todo').textContent).toContain('Sin tareas');
      expect(column('inbox').textContent).toContain('Sin reportes');
      TestBed.resetTestingModule();
      const withOld = await render(sample());
      expect(withOld.titles('done')).toEqual(['Hecha reciente']);
      expect(titles('todo')).toEqual([]);
    });

    it('CP-05-26: the "+" of a column creates a task there, in the chosen project, and updates the count', async () => {
      const { el, column, settle, createTask, titles, pick } = await render(sample());
      const add = async (status: string, title: string) => {
        column(status).querySelector<HTMLButtonElement>('[data-testid="board-add"]')!.click();
        await settle();
        const input = column(status).querySelector<HTMLInputElement>(
          '[data-testid="board-add-input"]',
        )!;
        input.value = title;
        input.dispatchEvent(new Event('input'));
        column(status)
          .querySelector<HTMLFormElement>('[data-testid="board-add-form"]')!
          .dispatchEvent(new Event('submit'));
        await settle();
        await settle();
      };
      const plus = column('in_progress').querySelector('[data-testid="board-add"]')!;
      expect(plus.getAttribute('aria-label')).toBe('Agregar tarea en En curso');

      await add('in_progress', 'Nueva curso');
      expect(createTask).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: null }));
      expect(titles('in_progress')).toContain('Nueva curso');
      expect(heads(el)[2]!.text).toBe('En curso · 2');

      await pick('2');
      await add('todo', 'En web');
      expect(createTask).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: 2 }));
      expect(titles('todo')).toContain('En web');
    });

    it('CP-05-27: Entrantes has no "+" and an empty title creates nothing', async () => {
      const { column, settle, createTask, titles } = await render(sample());
      expect(column('inbox').querySelector('[data-testid="board-add"]')).toBeNull();
      column('todo').querySelector<HTMLButtonElement>('[data-testid="board-add"]')!.click();
      await settle();
      column('todo')
        .querySelector<HTMLFormElement>('[data-testid="board-add-form"]')!
        .dispatchEvent(new Event('submit'));
      await settle();
      expect(createTask).not.toHaveBeenCalled();
      expect(
        column('todo').querySelector('[data-testid="board-add-error"]')!.textContent,
      ).toContain('Escribe un título');
      expect(titles('todo')).toHaveLength(3);
    });

    it('CP-15-11: Entrantes lists only portal reports with title, "Portal" and "Sin revisar"', async () => {
      const { column } = await render([], {
        inbox: [report(1, 'Falla login'), report(2, 'Captura rápida', 'quick_capture')],
      });
      const cards = column('inbox').querySelectorAll('[data-testid="inbox-card"]');
      expect(cards).toHaveLength(1);
      expect(cards[0]!.textContent).toContain('Falla login');
      expect(cards[0]!.querySelector('[data-testid="origin-badge"]')!.textContent).toBe('Portal');
      expect(cards[0]!.querySelector('[data-testid="inbox-unreviewed"]')!.textContent).toBe(
        'Sin revisar',
      );
      expect(column('inbox').textContent).not.toContain('Captura rápida');
    });

    it('CP-15-12: classifying a report as a task moves it from Entrantes to Por hacer', async () => {
      const { el, column, settle, titles, convertInboxItem } = await render(sample(), {
        inbox: [report(7, 'Reporte uno')],
      });
      column('inbox')
        .querySelector<HTMLButtonElement>('[data-testid="inbox-classify-task"]')!
        .click();
      await settle();
      await settle();
      expect(convertInboxItem).toHaveBeenCalledWith(7, {
        type: 'task',
        input: expect.objectContaining({ title: 'Reporte uno' }),
      });
      expect(column('inbox').querySelector('[data-testid="inbox-card"]')).toBeNull();
      expect(titles('todo')).toContain('Reporte uno');
      expect(heads(el)[0]!.text).toBe('Entrantes · 0');
    });

    it('CP-15-13: discarding asks for confirmation and removes the report', async () => {
      const { column, settle, discardInboxItem } = await render([], {
        inbox: [report(7, 'Reporte')],
      });
      column('inbox').querySelector<HTMLButtonElement>('[data-testid="inbox-discard"]')!.click();
      await settle();
      expect(discardInboxItem).not.toHaveBeenCalled();
      column('inbox')
        .querySelector<HTMLButtonElement>('[data-testid="inbox-discard-cancel"]')!
        .click();
      await settle();
      expect(column('inbox').querySelector('[data-testid="inbox-card"]')).not.toBeNull();

      column('inbox').querySelector<HTMLButtonElement>('[data-testid="inbox-discard"]')!.click();
      await settle();
      column('inbox')
        .querySelector<HTMLButtonElement>('[data-testid="inbox-discard-confirm"]')!
        .click();
      await settle();
      expect(discardInboxItem).toHaveBeenCalledWith(7);
      expect(column('inbox').querySelector('[data-testid="inbox-card"]')).toBeNull();
    });

    it('CP-15-14: Entrantes is the same in every board and ignores the tag filter', async () => {
      const { column, pick, chip, settle } = await render(sample(), { inbox: [report(1, 'R')] });
      const count = () => column('inbox').querySelectorAll('[data-testid="inbox-card"]').length;
      for (const value of ['loose', '1', 'general']) {
        await pick(value);
        expect(count()).toBe(1);
      }
      chip('board-filter-tag', '#infra').click();
      await settle();
      expect(count()).toBe(1);
    });

    it('CP-15-15: classifying as bug is disabled with "Disponible pronto" and creates nothing', async () => {
      const { column, convertInboxItem, createTask } = await render([], {
        inbox: [report(1, 'R')],
      });
      const bug = column('inbox').querySelector<HTMLButtonElement>(
        '[data-testid="inbox-classify-bug"]',
      )!;
      expect(bug.disabled).toBe(true);
      expect(bug.title).toBe('Disponible pronto');
      bug.click();
      expect(convertInboxItem).not.toHaveBeenCalled();
      expect(createTask).not.toHaveBeenCalled();
    });

    it('CP-04-17: a card shows title, project or "Suelta", tags and repetition without a visible Mover button', async () => {
      const { el } = await render([
        task(1, {
          title: 'Con todo',
          projectId: 1,
          projectName: 'api',
          tags: ['infra'],
          recurrence: { kind: 'daily' },
        }),
        task(2, { title: 'Sin nada' }),
      ]);
      const full = cardOf(el, 'Con todo');
      expect(full.querySelector('[data-testid="project-chip"]')!.textContent).toBe('api');
      expect(full.querySelector('[data-testid="tag-chip"]')!.textContent).toBe('#infra');
      expect(full.querySelector('[data-testid="repeat-chip"]')).not.toBeNull();
      const plain = cardOf(el, 'Sin nada');
      expect(plain.querySelector('[data-testid="project-chip"]')!.textContent).toBe('Suelta');
      expect(plain.querySelector('[data-testid="repeat-chip"]')).toBeNull();
      const move = plain.querySelector('[data-testid="board-move"]')!;
      expect(move.className).toContain('opacity-0');
      expect(move.textContent).not.toContain('Mover');
    });

    it('CP-04-18: dates read "Venció ayer", "Hoy", "Mañana" and "Completada ayer"; no date shows nothing', async () => {
      const day = (offset: number) => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      };
      const { el } = await render([
        task(1, { title: 'Ayer', dueDate: day(-1) }),
        task(2, { title: 'Hace tres', dueDate: day(-3) }),
        task(3, { title: 'Hoy t', dueDate: day(0) }),
        task(4, { title: 'Manana t', dueDate: day(1) }),
        task(5, { title: 'Sin fecha' }),
        task(6, {
          title: 'Hecha ayer',
          status: 'done',
          completedAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        }),
        task(7, { title: 'Hecha hoy', status: 'done', completedAt: new Date().toISOString() }),
      ]);
      const date = (title: string) =>
        cardOf(el, title).querySelector('[data-testid="board-card-date"]')?.textContent?.trim();
      expect(date('Ayer')).toBe('Venció ayer');
      expect(cardOf(el, 'Ayer').querySelector('.text-warn')).not.toBeNull();
      expect(date('Hace tres')).toBe('Venció hace 3 días');
      expect(date('Hoy t')).toBe('Hoy');
      expect(date('Manana t')).toBe('Mañana');
      expect(date('Sin fecha')).toBeUndefined();
      expect(date('Hecha ayer')).toBe('Completada ayer');
      expect(date('Hecha hoy')).toBe('Completada hoy');
    });

    it('CP-04-19: a long title is truncated but keeps its full text as accessible name; extra tags collapse into +N', async () => {
      const long = 'x'.repeat(300);
      const { el } = await render([task(1, { title: long, tags: ['a', 'b', 'c', 'd'] })]);
      const card = el.querySelector<HTMLElement>('[data-testid="board-card"]')!;
      expect(card.getAttribute('aria-label')).toBe(long);
      expect(card.querySelector('[data-testid="board-card-title"]')!.className).toContain(
        'truncate',
      );
      expect(card.querySelectorAll('[data-testid="board-card-tag"]')).toHaveLength(2);
      expect(card.querySelector('[data-testid="board-card-more-tags"]')!.textContent).toBe('+2');
    });

    it('CP-04-20: the menu appears on hover/focus and moving updates both counts', async () => {
      const { el, settle } = await render(sample());
      const trigger = cardOf(el, 'Suelta uno').querySelector<HTMLElement>(
        '[data-testid="board-move"]',
      )!;
      expect(trigger.className).toContain('group-hover:opacity-100');
      expect(trigger.className).toContain('group-focus-within:opacity-100');
      trigger.click();
      await settle();
      el.querySelector<HTMLButtonElement>(
        '[data-testid="board-move-option"][data-status="in_progress"]',
      )!.click();
      await settle();
      expect(heads(el).map((h) => h.text)).toEqual([
        'Entrantes · 0',
        'Por hacer · 2',
        'En curso · 2',
        'Hecho · 1',
      ]);
    });

    it('CP-04-21: the menu works with the keyboard alone and Escape returns focus to the card', async () => {
      const { el, settle } = await render(sample());
      document.body.appendChild(el);
      const card = cardOf(el, 'Suelta uno');
      card.focus();
      key(card, 'Enter');
      await settle();
      await new Promise((r) => setTimeout(r));
      const items = [...card.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
      expect(items[0]!.disabled).toBe(true);
      expect(document.activeElement).toBe(items[1]);
      key(items[1]!, 'ArrowDown');
      expect(document.activeElement).toBe(items[2]);
      key(items[2]!, 'ArrowUp');
      expect(document.activeElement).toBe(items[1]);

      key(items[1]!, 'Escape');
      await settle();
      await new Promise((r) => setTimeout(r));
      expect(card.querySelector('[role="menu"]')).toBeNull();
      expect(document.activeElement).toBe(card);
      el.remove();
    });

    it('CP-04-22: a task moved to Hecho and back keeps its chips and date and is not duplicated', async () => {
      const { el, settle, titles } = await render([
        task(1, {
          title: 'Rep',
          projectId: 1,
          projectName: 'api',
          tags: ['infra'],
          dueDate: '2099-01-01',
          recurrence: { kind: 'daily' },
        }),
      ]);
      const move = async (target: string) => {
        cardOf(el, 'Rep').querySelector<HTMLButtonElement>('[data-testid="board-move"]')!.click();
        await settle();
        cardOf(el, 'Rep')
          .querySelector<HTMLButtonElement>(
            `[data-testid="board-move-option"][data-status="${target}"]`,
          )!
          .click();
        await settle();
        await settle();
      };
      await move('done');
      await move('todo');
      expect(titles('todo')).toEqual(['Rep']);
      expect(el.querySelectorAll('[data-testid="board-card"]')).toHaveLength(1);
      const card = cardOf(el, 'Rep');
      expect(card.querySelector('[data-testid="project-chip"]')!.textContent).toBe('api');
      expect(card.querySelector('[data-testid="tag-chip"]')).not.toBeNull();
      expect(card.querySelector('[data-testid="repeat-chip"]')).not.toBeNull();
      expect(card.querySelector('[data-testid="board-card-date"]')).not.toBeNull();
    });

    it('CP-07-08: the combo box and tag chips highlight the chosen option in teal and expose its state', async () => {
      const { select, options, pick, el, chip, settle } = await render(sample());
      select().click();
      await settle();
      const opt = (v: string) =>
        el.querySelector<HTMLElement>(`[data-testid="board-select-option"][data-value="${v}"]`)!;
      expect(select().getAttribute('aria-haspopup')).toBe('listbox');
      expect(opt('general').getAttribute('aria-selected')).toBe('true');
      expect(opt('general').className).toContain('text-accent');
      expect(opt('1').getAttribute('aria-selected')).toBe('false');
      expect(el.querySelector('[role="listbox"]')).not.toBeNull();
      await options();
      await pick('1');
      expect(select().textContent).toContain('api');
      chip('board-filter-tag', '#ui').click();
      await settle();
      const ui = chip('board-filter-tag', '#ui');
      expect(ui.getAttribute('aria-pressed')).toBe('true');
      expect(ui.className).toContain('text-accent');
      expect(chip('board-filter-tag', '#infra').className).not.toContain('text-accent');
    });

    it('CP-07-09: with more than 8 tags the 8 most used show plus "más…", and a chosen hidden tag stays visible', async () => {
      const tags = Array.from({ length: 10 }, (_, i) => `t${i}`);
      // t9 is used the most, t0 the least.
      const stored = tags.flatMap((t, i) =>
        Array.from({ length: i + 1 }, (_, n) => task(i * 20 + n + 1, { tags: [t] })),
      );
      const { el, settle, chip } = await render(stored, { tags });
      const shown = () =>
        [
          ...el.querySelectorAll('[data-testid="board-tags"] > [data-testid="board-filter-tag"]'),
        ].map((b) => b.textContent!.trim());
      expect(shown()).toEqual(['#t9', '#t8', '#t7', '#t6', '#t5', '#t4', '#t3', '#t2']);
      const more = el.querySelector<HTMLButtonElement>('[data-testid="board-tags-more"]')!;
      expect(more.textContent!.trim()).toBe('más…');
      expect(more.getAttribute('aria-expanded')).toBe('false');
      more.click();
      await settle();
      const rest = [...el.querySelectorAll('[data-testid="board-tags-rest"] button')].map((b) =>
        b.textContent!.trim(),
      );
      expect(rest).toEqual(['#t1', '#t0']);

      chip('board-filter-tag', '#t0').click();
      await settle();
      expect(shown()).toContain('#t0');
      const chosen = chip('board-filter-tag', '#t0');
      expect(chosen.getAttribute('aria-pressed')).toBe('true');
      expect(chosen.className).toContain('text-accent');
    });

    it('CP-07-09: with 8 tags or fewer there is no "más…" button', async () => {
      const { el } = await render(sample());
      expect(el.querySelector('[data-testid="board-tags-more"]')).toBeNull();
    });

    it('CP-N16-01: the new board texts live in es.json', () => {
      const board = (es as { board: Record<string, unknown> }).board;
      for (const key of [
        'add',
        'addTitle',
        'addPlaceholder',
        'moreTags',
        'panelFold',
        'panelUnfold',
      ]) {
        expect(typeof board[key]).toBe('string');
      }
      expect((board['columns'] as Record<string, string>)['inbox']).toBe('Entrantes');
      expect(Object.keys(board['inbox'] as object)).toEqual(
        expect.arrayContaining(['unreviewed', 'empty', 'classifyTask', 'classifyBug']),
      );
    });

    it('CP-07-10: tag filters combine with the chosen board and are keyboard-operable buttons', async () => {
      const { el, settle, pick, titles, chip } = await render(sample());
      await pick('1');
      chip('board-filter-tag', '#infra').click();
      await settle();
      expect(titles('todo')).toEqual(['Api infra']);
      for (const b of el.querySelectorAll('[data-testid="board-filter-tag"]')) {
        expect(b.tagName).toBe('BUTTON');
      }
    });

    it('CP-04-23: the Proyectos panel is a folding side panel next to the four columns', async () => {
      const { el, settle, setBoardPanelOpen } = await render(sample());
      const panel = el.querySelector<HTMLElement>('[data-testid="board-projects-panel"]')!;
      const grid = el.querySelector<HTMLElement>('[data-testid="board-grid"]')!;
      expect(grid.querySelectorAll('[data-testid="board-column"]')).toHaveLength(4);
      expect(grid.contains(panel)).toBe(false);
      expect(panel.className).toContain('w-48');
      const toggle = panel.querySelector<HTMLButtonElement>('[data-testid="board-panel-toggle"]')!;
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      toggle.click();
      await settle();
      expect(panel.dataset['open']).toBe('false');
      expect(panel.className).toContain('w-12');
      expect(panel.querySelector('[data-testid="board-project-item"]')).toBeNull();
      expect(setBoardPanelOpen).toHaveBeenLastCalledWith(false);
    });

    it('CP-04-23: a folded panel is restored folded on open', async () => {
      const { el } = await render(sample(), { panelOpen: false });
      const panel = el.querySelector<HTMLElement>('[data-testid="board-projects-panel"]')!;
      expect(panel.dataset['open']).toBe('false');
    });

    it('CP-04-24: folding keeps the chosen board, creating a project still works and narrow windows scroll', async () => {
      const { el, settle, create, current, pick } = await render(sample());
      await pick('2');
      const toggle = () =>
        el.querySelector<HTMLButtonElement>('[data-testid="board-panel-toggle"]')!;
      toggle().click();
      await settle();
      toggle().click();
      await settle();
      expect(current()).toBe('2');
      await create('nuevo');
      expect(el.querySelectorAll('[data-testid="board-project-item"]')).toHaveLength(3);
      const scroll = el.querySelector<HTMLElement>('[data-testid="board-scroll"]')!;
      expect(scroll.className).toContain('overflow-x-auto');
      expect(el.querySelector('[data-testid="board-grid"]')!.className).toContain('minmax(15rem');
    });
  });
});
