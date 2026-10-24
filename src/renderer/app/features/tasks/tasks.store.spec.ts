import { TestBed } from '@angular/core/testing';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type { Task, TaskResult } from '../../../../shared/tasks';
import { DESKTOP_API } from '../../core/desktop-api';
import { TasksStore } from './tasks.store';

const task = (id: number, status: Task['status'] = 'todo', title = `t${id}`): Task => ({
  id,
  title,
  status,
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

function setup(stored: Task[]) {
  const api = {
    listTasks: vi.fn(async () => stored),
    listTags: vi.fn(async () => ['api', 'infra']),
    listProjects: vi.fn(async () => []),
    createProject: vi.fn(async (name: string) => ({ ok: true, project: { id: 5, name } })),
    createTask: vi.fn(async (input): Promise<TaskResult> => ({
      ok: true,
      task: { ...task(9), title: input.title },
    })),
    updateTask: vi.fn(async (id, input): Promise<TaskResult> => ({
      ok: true,
      task: { ...task(id), title: input.title, dueDate: input.dueDate },
    })),
    setTaskStatus: vi.fn(async (id, status): Promise<TaskResult> => ({
      ok: true,
      task: task(id, status),
    })),
    setTaskForToday: vi.fn(async (id, forToday): Promise<TaskResult> => ({
      ok: true,
      task: { ...task(id), forToday },
    })),
    deleteTask: vi.fn(async () => true),
    deleteSeries: vi.fn(async () => true),
    hideFromToday: vi.fn(async (ids: number[]) => ids.length),
  } as unknown as OrquestadorApi;
  TestBed.configureTestingModule({ providers: [{ provide: DESKTOP_API, useValue: api }] });
  return { store: TestBed.inject(TasksStore), api };
}

describe('TasksStore', () => {
  it('CP-03-28: hideFromToday sends only completed tasks and reloads the list', async () => {
    const { store, api } = setup([task(1, 'done'), task(2), task(3, 'done')]);
    await store.load();
    api.listTasks = vi.fn(async () => [task(2)]);

    await store.hideFromToday(store.tasks());

    expect(api.hideFromToday).toHaveBeenCalledWith([1, 3]);
    expect(store.tasks().map((t) => t.id)).toEqual([2]);
  });

  it('CP-03-27: hideFromToday does not call main when nothing is completed', async () => {
    const { store, api } = setup([task(2)]);
    await store.load();
    await store.hideFromToday(store.tasks());
    expect(api.hideFromToday).not.toHaveBeenCalled();
  });

  it('CP-04-03: move sends the new status and keeps the returned task', async () => {
    const { store, api } = setup([task(1)]);
    await store.load();
    await store.move(store.tasks()[0], 'in_progress');
    expect(api.setTaskStatus).toHaveBeenCalledWith(1, 'in_progress');
    expect(store.tasks()[0].status).toBe('in_progress');
    expect(store.visible().map((t) => t.id)).toEqual([1]);
  });

  it('CP-02-04: completing a task removes it from the pending view and un-completing brings it back', async () => {
    const { store } = setup([task(1), task(2)]);
    await store.load();

    await store.setDone(store.tasks()[0], true);
    expect(store.visible().map((t) => t.id)).toEqual([2]);

    store.showCompleted.set(true);
    expect(store.visible()).toHaveLength(2);
    store.showCompleted.set(false);

    await store.setDone(store.tasks()[0], false);
    expect(store.visible().map((t) => t.id)).toEqual([1, 2]);
  });

  it('CP-02-03: editing sends the new title and due date', async () => {
    const { store, api } = setup([task(1)]);
    await store.load();

    const error = await store.save({ title: ' Nuevo ', dueDate: '2026-04-01', projectId: null }, 1);

    expect(error).toBeNull();
    expect(api.updateTask).toHaveBeenCalledWith(1, {
      title: ' Nuevo ',
      dueDate: '2026-04-01',
      projectId: null,
    });
    expect(api.listTasks).toHaveBeenCalledTimes(2);
  });

  it('CP-02-06: an empty or over-200 title is rejected without calling the API', async () => {
    const { store, api } = setup([]);
    expect(await store.save({ title: '  ', dueDate: null, projectId: null })).toBe('empty');
    expect(await store.save({ title: 'a'.repeat(201), dueDate: null, projectId: null })).toBe(
      'too_long',
    );
    expect(api.createTask).not.toHaveBeenCalled();
  });

  it('CP-02-05: remove drops only the deleted task', async () => {
    const { store } = setup([task(1), task(2)]);
    await store.load();
    await store.remove(store.tasks()[0]);
    expect(store.tasks().map((t) => t.id)).toEqual([2]);
  });

  it('CP-03-08: marking and unmarking "para hoy" updates the task in the list', async () => {
    const { store, api } = setup([task(1)]);
    await store.load();

    await store.setForToday(store.tasks()[0], true);
    expect(api.setTaskForToday).toHaveBeenCalledWith(1, true);
    expect(store.tasks()[0].forToday).toBe(true);

    await store.setForToday(store.tasks()[0], false);
    expect(store.tasks()[0].forToday).toBe(false);
  });

  it('CP-07-04: filtering by a tag shows only tasks that have it, clearing it shows all', async () => {
    const { store } = setup([
      { ...task(1), tags: ['infra'] },
      task(2),
      { ...task(3), tags: ['api', 'infra'] },
    ]);
    await store.load();
    expect(store.tags()).toEqual(['api', 'infra']);

    store.tagFilter.set('infra');
    expect(store.visible().map((t) => t.id)).toEqual([1, 3]);
    store.tagFilter.set('api');
    expect(store.visible().map((t) => t.id)).toEqual([3]);

    store.tagFilter.set(null);
    expect(store.visible().map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it('CP-07-04: the tag filter is dropped when that tag is no longer in use', async () => {
    const { store } = setup([task(1)]);
    store.tagFilter.set('gone');
    await store.load();
    expect(store.tagFilter()).toBeNull();
  });

  it('CP-06-09: series are the open instances that carry a repeating rule', async () => {
    const weekly = task(1);
    weekly.seriesId = 7;
    weekly.recurrence = { kind: 'weekly', weekday: 5 };
    const finished = { ...weekly, id: 2, status: 'done' as const };
    const { store } = setup([weekly, finished, task(3)]);
    await store.load();
    expect(store.series().map((t) => t.id)).toEqual([1]);

    store.seriesKindFilter.set('daily');
    expect(store.visibleSeries()).toEqual([]);
    store.seriesKindFilter.set('weekly');
    expect(store.visibleSeries().map((t) => t.id)).toEqual([1]);
    store.seriesProjectFilter.set(99);
    expect(store.visibleSeries()).toEqual([]);
  });

  it('CP-06-03: completing a series instance reloads the list to pick up the next one', async () => {
    const instance = task(1);
    instance.seriesId = 7;
    instance.recurrence = { kind: 'daily' };
    const { store, api } = setup([instance]);
    await store.load();
    await store.setDone(instance, true);
    expect(api.setTaskStatus).toHaveBeenCalledWith(1, 'done');
    expect(api.listTasks).toHaveBeenCalledTimes(2);
  });

  it('CP-06-11: removeSeries calls main and reloads', async () => {
    const { store, api } = setup([]);
    await store.removeSeries(7);
    expect(api.deleteSeries).toHaveBeenCalledWith(7);
    expect(api.listTasks).toHaveBeenCalledTimes(1);
  });

  it('CP-06-12: rejects an incomplete rule before calling main', async () => {
    const { store, api } = setup([]);
    const error = await store.save({
      title: 'x',
      dueDate: '2026-03-06',
      projectId: null,
      recurrence: { kind: 'weekly', weekday: NaN },
    });
    expect(error).toBe('recurrence_weekday');
    expect(api.createTask).not.toHaveBeenCalled();
  });

  it('CP-04-06: createProject adds the project to the sorted list', async () => {
    const { store, api } = setup([]);
    await store.load();
    expect(await store.createProject('  zeta ')).toEqual({ project: { id: 5, name: 'zeta' } });
    await store.createProject('alfa');
    expect(api.createProject).toHaveBeenCalledWith('zeta');
    expect(store.projects().map((p) => p.name)).toEqual(['alfa', 'zeta']);
  });

  it('CP-04-07: createProject rejects an invalid name without calling the API', async () => {
    const { store, api } = setup([]);
    expect(await store.createProject('  ')).toEqual({ error: 'empty' });
    expect(api.createProject).not.toHaveBeenCalled();
  });

  it('CP-05-13: project (including loose) and repetition filters combine', async () => {
    const stored = [
      { ...task(1), projectId: 1, projectName: 'a' },
      { ...task(2), projectId: 1, projectName: 'a', recurrence: { kind: 'daily' } as const },
      task(3),
    ];
    const { store } = setup(stored);
    await store.load();
    store.projectFilter.set('loose');
    expect(store.visible().map((t) => t.id)).toEqual([3]);
    store.projectFilter.set(null);
    store.kindFilter.set('daily');
    expect(store.visible().map((t) => t.id)).toEqual([2]);
    store.kindFilter.set('once');
    expect(store.visible().map((t) => t.id)).toEqual([1, 3]);
  });

  it('CP-05-11: counts pending tasks and open series', async () => {
    const { store } = setup([
      task(1),
      task(2, 'done'),
      {
        ...task(3),
        seriesId: 1,
        dueDate: '2999-01-04',
        recurrence: { kind: 'daily' } as const,
      },
    ]);
    await store.load();
    expect(store.pendingCount()).toBe(2);
    expect(store.seriesCount()).toBe(1);
  });

  it('CP-05-26: create saves the task and sends it to the requested column; an empty title is rejected', async () => {
    const { store, api } = setup([task(9)]);
    expect(await store.create({ title: '  ', dueDate: null, projectId: null }, 'done')).toBe(
      'empty',
    );
    expect(api.createTask).not.toHaveBeenCalled();

    expect(
      await store.create({ title: 'Nueva', dueDate: null, projectId: null }, 'todo'),
    ).toBeNull();
    expect(api.setTaskStatus).not.toHaveBeenCalled();
    expect(
      await store.create({ title: 'Otra', dueDate: null, projectId: null }, 'done'),
    ).toBeNull();
    expect(api.setTaskStatus).toHaveBeenCalledWith(9, 'done');
    expect(api.listTasks).toHaveBeenCalled();
  });
});
