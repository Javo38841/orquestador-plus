import { TestBed } from '@angular/core/testing';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type { Task } from '../../../../shared/tasks';
import { DESKTOP_API } from '../../core/desktop-api';
import { TasksStore } from '../tasks/tasks.store';
import { FocusTimerService, formatClock } from './focus-timer.service';

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
  hiddenFromTodayAt: null,
});

async function setup(stored: Task[], savedMinutes = 25) {
  const api = {
    getFocusMinutes: vi.fn(async () => savedMinutes),
    setFocusMinutes: vi.fn(async (minutes: number) => minutes),
    listTasks: vi.fn(async () => stored),
    listTags: async () => [],
    listProjects: async () => [],
  } as unknown as OrquestadorApi;
  TestBed.configureTestingModule({ providers: [{ provide: DESKTOP_API, useValue: api }] });
  const store = TestBed.inject(TasksStore);
  await store.load();
  const timer = TestBed.inject(FocusTimerService);
  await timer.load();
  return {
    timer,
    store,
    api: api as unknown as {
      listTasks: ReturnType<typeof vi.fn>;
      getFocusMinutes: ReturnType<typeof vi.fn>;
      setFocusMinutes: ReturnType<typeof vi.fn>;
    },
  };
}

describe('FocusTimerService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('CP-17-01: starting with a task runs from the full 25:00', async () => {
    const { timer } = await setup([task(1)]);
    timer.select(1);
    expect(timer.start()).toBe(true);
    expect(timer.state()).toBe('running');
    expect(timer.remainingMs()).toBe(25 * 60 * 1000);
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
    vi.advanceTimersByTime(25 * 60 * 1000 + 5000);
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

  describe('duration (RF-17)', () => {
    it('CP-17-10: adjusting steps by 5 minutes and the clock follows', async () => {
      const { timer } = await setup([task(1)]);
      timer.adjustDuration(5);
      expect(timer.durationMinutes()).toBe(30);
      expect(timer.clock()).toBe('30:00');
      timer.adjustDuration(-5);
      timer.adjustDuration(-5);
      expect(timer.durationMinutes()).toBe(20);
      expect(timer.clock()).toBe('20:00');
    });

    it('CP-17-11: the duration is kept within 1 and 180', async () => {
      const { timer } = await setup([task(1)], 180);
      expect(timer.durationMinutes()).toBe(180);
      timer.adjustDuration(5);
      expect(timer.durationMinutes()).toBe(180);
      timer.setDuration(3);
      timer.adjustDuration(-5);
      expect(timer.durationMinutes()).toBe(1);
      timer.adjustDuration(-5);
      expect(timer.durationMinutes()).toBe(1);
      timer.setDuration(178);
      timer.adjustDuration(5);
      expect(timer.durationMinutes()).toBe(180);
    });

    it('CP-17-12: a shortcut sets that duration', async () => {
      const { timer } = await setup([task(1)]);
      for (const minutes of [15, 25, 30, 45, 60]) {
        expect(timer.setDuration(minutes)).toBe(true);
        expect(timer.durationMinutes()).toBe(minutes);
      }
    });

    it('CP-17-13: an integer from 1 to 180 is applied', async () => {
      const { timer } = await setup([task(1)]);
      expect(timer.setDuration(90)).toBe(true);
      expect(timer.clock()).toBe('90:00');
      expect(timer.setDuration(1)).toBe(true);
      expect(timer.setDuration(180)).toBe(true);
    });

    it('CP-17-14: invalid values are not applied and keep the previous duration', async () => {
      const { timer, api } = await setup([task(1)]);
      timer.setDuration(40);
      api.setFocusMinutes.mockClear();
      for (const bad of [0, -1, 181, 1.5, NaN, Infinity]) {
        expect(timer.setDuration(bad)).toBe(false);
      }
      expect(timer.durationMinutes()).toBe(40);
      expect(api.setFocusMinutes).not.toHaveBeenCalled();
    });

    it('CP-17-16: the countdown starts from the chosen duration', async () => {
      const { timer } = await setup([task(1)]);
      timer.setDuration(45);
      timer.select(1);
      timer.start();
      expect(timer.clock()).toBe('45:00');
      expect(timer.totalMs()).toBe(45 * 60_000);
      vi.advanceTimersByTime(60_000);
      expect(timer.clock()).toBe('44:00');
    });

    it('CP-17-17: reset returns to the chosen duration, stopped', async () => {
      const { timer } = await setup([task(1)]);
      timer.setDuration(45);
      timer.select(1);
      timer.start();
      vi.advanceTimersByTime(10_000);
      timer.reset();
      expect(timer.state()).toBe('idle');
      expect(timer.clock()).toBe('45:00');
    });

    it('CP-17-18: the duration cannot change while running or paused', async () => {
      const { timer } = await setup([task(1)]);
      timer.select(1);
      timer.start();
      expect(timer.canEditDuration()).toBe(false);
      expect(timer.setDuration(60)).toBe(false);
      expect(timer.adjustDuration(5)).toBe(false);
      timer.pause();
      expect(timer.canEditDuration()).toBe(false);
      expect(timer.setDuration(60)).toBe(false);
      expect(timer.durationMinutes()).toBe(25);
    });

    it('CP-17-19: choosing a duration saves it through the API', async () => {
      const { timer, api } = await setup([task(1)]);
      timer.setDuration(50);
      expect(api.setFocusMinutes).toHaveBeenCalledWith(50);
    });

    it('CP-17-20: loads the saved duration', async () => {
      const saved = await setup([task(1)], 45);
      expect(saved.timer.durationMinutes()).toBe(45);
      expect(saved.timer.clock()).toBe('45:00');
    });

    it('CP-17-20: an invalid saved value keeps 25 minutes', async () => {
      const { timer } = await setup([task(1)], 999);
      expect(timer.durationMinutes()).toBe(25);
      expect(timer.clock()).toBe('25:00');
    });

    it('CP-17-23: +5 min lengthens a running session and keeps its state', async () => {
      const { timer } = await setup([task(1)]);
      timer.select(1);
      timer.start();
      vi.advanceTimersByTime(60_000);
      timer.extend();
      expect(timer.state()).toBe('running');
      expect(timer.clock()).toBe('29:00');
      expect(timer.totalMs()).toBe(30 * 60_000);
      vi.advanceTimersByTime(60_000);
      expect(timer.clock()).toBe('28:00');
    });

    it('CP-17-23: +5 min lengthens a paused session and keeps it paused', async () => {
      const { timer } = await setup([task(1)]);
      timer.select(1);
      timer.start();
      vi.advanceTimersByTime(60_000);
      timer.pause();
      timer.extend();
      expect(timer.state()).toBe('paused');
      expect(timer.clock()).toBe('29:00');
      timer.resume();
      vi.advanceTimersByTime(60_000);
      expect(timer.clock()).toBe('28:00');
    });

    it('CP-17-24: +5 min never takes the session above 180 minutes', async () => {
      const { timer } = await setup([task(1)], 178);
      timer.select(1);
      timer.start();
      expect(timer.canExtend()).toBe(false);
      timer.extend();
      expect(timer.totalMs()).toBe(178 * 60_000);
      timer.reset();
      timer.setDuration(170);
      timer.start();
      timer.extend();
      expect(timer.canExtend()).toBe(true);
      timer.extend();
      expect(timer.totalMs()).toBe(180 * 60_000);
      expect(timer.canExtend()).toBe(false);
      timer.extend();
      expect(timer.totalMs()).toBe(180 * 60_000);
    });

    it('CP-17-25: +5 min is unavailable when stopped, and extras vanish on reset or finish', async () => {
      const { timer, api } = await setup([task(1)]);
      expect(timer.canExtend()).toBe(false);
      timer.extend();
      expect(timer.extraMinutes()).toBe(0);
      timer.select(1);
      timer.start();
      timer.extend();
      timer.reset();
      expect(timer.clock()).toBe('25:00');
      expect(timer.extraMinutes()).toBe(0);
      timer.start();
      timer.extend();
      vi.advanceTimersByTime(30 * 60_000 + 1000);
      expect(timer.state()).toBe('finished');
      timer.start();
      expect(timer.clock()).toBe('25:00');
      expect(timer.durationMinutes()).toBe(25);
      expect(api.setFocusMinutes).not.toHaveBeenCalled();
    });
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
      expect(timer.remainingMs()).toBe(25 * 60 * 1000 - 60_000);
      expect(timer.state()).toBe('running');
      expect(live.size).toBe(1);
    });

    it('CP-N10-05: a session that ends while hidden is finished when the window shows again', async () => {
      const { timer } = await setup([task(1)]);
      timer.select(1);
      timer.start();
      setVisibility('hidden');
      await vi.advanceTimersByTimeAsync(25 * 60 * 1000 + 1000);
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
