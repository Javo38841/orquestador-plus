import { TestBed } from '@angular/core/testing';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type { Task } from '../../../../shared/tasks';
import { DESKTOP_API } from '../../core/desktop-api';
import { TasksStore } from '../tasks/tasks.store';
import { FOCUS_DURATION_MS, FocusTimerService, formatClock } from './focus-timer.service';

const task = (id: number, status: Task['status'] = 'todo'): Task => ({
  id,
  title: `Tarea ${id}`,
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
});

async function setup(stored: Task[]) {
  const api = {
    listTasks: vi.fn(async () => stored),
    listTags: async () => [],
    listProjects: async () => [],
  } as unknown as OrquestadorApi;
  TestBed.configureTestingModule({ providers: [{ provide: DESKTOP_API, useValue: api }] });
  const store = TestBed.inject(TasksStore);
  await store.load();
  const timer = TestBed.inject(FocusTimerService);
  return { timer, store, api: api as unknown as { listTasks: ReturnType<typeof vi.fn> } };
}

describe('FocusTimerService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('CP-17-01: starting with a task runs from the full 25:00', async () => {
    const { timer } = await setup([task(1)]);
    timer.select(1);
    expect(timer.start()).toBe(true);
    expect(timer.state()).toBe('running');
    expect(timer.remainingMs()).toBe(FOCUS_DURATION_MS);
    expect(timer.clock()).toBe('25:00');
  });

  it('CP-17-02: the remaining time follows the clock, not the tick count', async () => {
    const { timer } = await setup([task(1)]);
    timer.select(1);
    timer.start();
    // One big jump (a throttled timer) must still account for all elapsed time.
    vi.setSystemTime(Date.now() + 90_000);
    timer.refresh();
    expect(timer.clock()).toBe('23:30');
    vi.advanceTimersByTime(1000);
    expect(timer.clock()).toBe('23:29');
  });

  it('CP-17-03: pausing freezes the time and resuming continues from it', async () => {
    const { timer } = await setup([task(1)]);
    timer.select(1);
    timer.start();
    vi.advanceTimersByTime(60_000);
    timer.pause();
    expect(timer.state()).toBe('paused');
    expect(timer.clock()).toBe('24:00');
    vi.advanceTimersByTime(120_000);
    expect(timer.clock()).toBe('24:00');
    timer.resume();
    vi.advanceTimersByTime(30_000);
    expect(timer.state()).toBe('running');
    expect(timer.clock()).toBe('23:30');
  });

  it('CP-17-04: resetting a running or paused session returns to full and stopped', async () => {
    const { timer } = await setup([task(1)]);
    timer.select(1);
    timer.start();
    vi.advanceTimersByTime(10_000);
    timer.reset();
    expect(timer.state()).toBe('idle');
    expect(timer.clock()).toBe('25:00');
    timer.start();
    vi.advanceTimersByTime(10_000);
    timer.pause();
    timer.reset();
    expect(timer.state()).toBe('idle');
    expect(timer.clock()).toBe('25:00');
  });

  it('CP-17-05: reaching zero finishes the session at 00:00, never negative', async () => {
    const { timer } = await setup([task(1)]);
    timer.select(1);
    timer.start();
    vi.advanceTimersByTime(FOCUS_DURATION_MS + 5000);
    expect(timer.state()).toBe('finished');
    expect(timer.remainingMs()).toBe(0);
    expect(timer.clock()).toBe('00:00');
    expect(formatClock(-500)).toBe('00:00');
  });

  it('CP-17-06: starting without a task is refused and flags it', async () => {
    const { timer } = await setup([task(1)]);
    expect(timer.start()).toBe(false);
    expect(timer.state()).toBe('idle');
    expect(timer.needsTask()).toBe(true);
    timer.select(1);
    expect(timer.needsTask()).toBe(false);
  });

  it('CP-17-07: completing or deleting the task stops the session', async () => {
    const { timer, store, api } = await setup([task(1), task(2)]);
    timer.select(1);
    timer.start();
    api.listTasks.mockResolvedValue([task(1, 'done'), task(2)]);
    await store.load();
    TestBed.tick();
    expect(timer.state()).toBe('idle');
    expect(timer.clock()).toBe('25:00');

    timer.select(2);
    timer.start();
    api.listTasks.mockResolvedValue([task(1, 'done')]);
    await store.load();
    TestBed.tick();
    expect(timer.state()).toBe('idle');
  });

  describe('resources (RNF-10)', () => {
    let visibility: DocumentVisibilityState;
    // Intervals created and not yet cleared (the framework adds its own timers, so
    // the fake clock's total count is not a reliable measure).
    let live: Set<unknown>;

    function setVisibility(value: DocumentVisibilityState) {
      visibility = value;
      document.dispatchEvent(new Event('visibilitychange'));
    }

    beforeEach(() => {
      visibility = 'visible';
      live = new Set();
      const realSet = globalThis.setInterval;
      const realClear = globalThis.clearInterval;
      vi.spyOn(globalThis, 'setInterval').mockImplementation(((
        ...args: Parameters<typeof setInterval>
      ) => {
        const handle = realSet(...args);
        live.add(handle);
        return handle;
      }) as typeof setInterval);
      vi.spyOn(globalThis, 'clearInterval').mockImplementation(((handle: never) => {
        live.delete(handle);
        realClear(handle);
      }) as typeof clearInterval);
      vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    });
    afterEach(() => vi.restoreAllMocks());

    it('CP-N10-05: hiding the window stops the periodic updates and showing it catches up', async () => {
      const { timer } = await setup([task(1)]);
      timer.select(1);
      timer.start();
      expect(live.size).toBe(1);

      setVisibility('hidden');
      expect(live.size).toBe(0);
      const before = timer.remainingMs();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(timer.remainingMs()).toBe(before);

      setVisibility('visible');
      expect(timer.remainingMs()).toBe(FOCUS_DURATION_MS - 60_000);
      expect(timer.state()).toBe('running');
      expect(live.size).toBe(1);
    });

    it('CP-N10-05: a session that ends while hidden is finished when the window shows again', async () => {
      const { timer } = await setup([task(1)]);
      timer.select(1);
      timer.start();
      setVisibility('hidden');
      await vi.advanceTimersByTimeAsync(FOCUS_DURATION_MS + 1000);
      setVisibility('visible');
      expect(timer.state()).toBe('finished');
      expect(live.size).toBe(0);
    });

    it('CP-N10-06: 100 create and destroy cycles leave no listeners or timers behind', async () => {
      const add = vi.spyOn(document, 'addEventListener');
      const remove = vi.spyOn(document, 'removeEventListener');
      for (let i = 0; i < 100; i++) {
        const { timer } = await setup([task(1)]);
        timer.select(1);
        timer.start();
        TestBed.resetTestingModule();
      }
      const added = add.mock.calls.filter(([type]) => type === 'visibilitychange').length;
      const removed = remove.mock.calls.filter(([type]) => type === 'visibilitychange').length;
      expect(added).toBe(100);
      expect(removed).toBe(100);
      expect(live.size).toBe(0);
    });
  });
});
