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
});

function setup(stored: Task[]) {
  const api = {
    listTasks: vi.fn(async () => stored),
    listTags: vi.fn(async () => ['api', 'infra']),
    listProjects: vi.fn(async () => []),
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
  } as unknown as OrquestadorApi;
  TestBed.configureTestingModule({ providers: [{ provide: DESKTOP_API, useValue: api }] });
  return { store: TestBed.inject(TasksStore), api };
}

describe('TasksStore', () => {
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
});
