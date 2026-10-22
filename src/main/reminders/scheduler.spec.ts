import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../locales/es.json';
import { openDatabase } from '../db/database';
import { setRemindersEnabled } from '../settings/settings';
import { createTask, deleteTask, listTasks, setTaskStatus, updateTask } from '../tasks/tasks';
import type { ReminderNotification } from './messages';
import { createReminderScheduler } from './scheduler';

describe('reminder scheduler', () => {
  let dir: string;
  let db: Database.Database;
  let clock: Date;
  let shown: ReminderNotification[];
  let timers: { run: () => void; ms: number; cleared: boolean }[];

  const local = (h: number, m = 0) => new Date(2026, 2, 10, h, m, 0);
  const at = (h: number, m = 0) =>
    `2026-03-10T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  function scheduler() {
    return createReminderScheduler({
      db,
      notify: (n) => shown.push(n),
      now: () => clock,
      setTimer: (run, ms) => {
        const timer = {
          ms,
          cleared: false,
          // A timer that has fired is spent, like a real one.
          run: () => {
            timer.cleared = true;
            run();
          },
        };
        timers.push(timer);
        return timer;
      },
      clearTimer: (handle) => {
        (handle as { cleared: boolean }).cleared = true;
      },
    });
  }

  const make = (title: string, reminderAt: string | null) => {
    const result = createTask(db, { title, reminderAt }, local(8));
    if (!result.ok) throw new Error(result.error);
    return result.task;
  };
  const active = () => timers.filter((t) => !t.cleared);

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-reminders-'));
    db = openDatabase(dir);
    clock = local(8);
    shown = [];
    timers = [];
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('CP-18-03: fires a pending reminder once when its time arrives', () => {
    make('Llamar al banco', at(9));
    const s = scheduler();
    s.start();
    expect(shown).toHaveLength(0);
    expect(active()[0]!.ms).toBe(60 * 60 * 1000);

    clock = local(9);
    active()[0]!.run();

    expect(shown).toHaveLength(1);
    expect(shown[0]!.title).toBe('Llamar al banco');
    expect(active()).toHaveLength(0);
  });

  it('CP-18-04: does not notify again on later evaluations or after a restart', () => {
    make('Una vez', at(9));
    clock = local(9);
    scheduler().start();
    expect(shown).toHaveLength(1);

    clock = local(10);
    const again = scheduler();
    again.refresh();
    again.refresh();
    // A new scheduler over the same database is the app restarting.
    scheduler().start();

    expect(shown).toHaveLength(1);
    expect(listTasks(db)[0]!.reminderNotifiedAt).not.toBeNull();
  });

  it('CP-18-05: a reminder that passed while the app was closed is notified once as overdue', () => {
    make('Pagar el hosting', at(7, 30));
    scheduler().start();

    expect(shown).toHaveLength(1);
    expect(shown[0]!.body).toBe(
      es.reminders.notification.late.replace('{{date}}', '2026-03-10').replace('{{time}}', '07:30'),
    );
    scheduler().start();
    expect(shown).toHaveLength(1);
  });

  it('CP-18-06: completed, deleted or cleared reminders do not notify', () => {
    const done = make('Completada', at(9));
    const removed = make('Eliminada', at(9));
    const cleared = make('Sin aviso', at(9));
    const s = scheduler();
    s.start();

    setTaskStatus(db, done.id, 'done', local(8, 30));
    deleteTask(db, removed.id);
    updateTask(db, cleared.id, { title: 'Sin aviso', reminderAt: null }, local(8, 30));
    s.refresh();
    expect(active()).toHaveLength(0);

    clock = local(9, 5);
    s.refresh();
    expect(shown).toHaveLength(0);
  });

  it('CP-18-06: a reminder moved to a later time notifies at the new time', () => {
    const task = make('Reprogramada', at(9));
    const s = scheduler();
    s.start();
    updateTask(db, task.id, { title: 'Reprogramada', reminderAt: at(11) }, local(8, 10));
    s.refresh();
    clock = local(9, 30);
    s.refresh();
    expect(shown).toHaveLength(0);
    clock = local(11);
    s.refresh();
    expect(shown).toHaveLength(1);
  });

  it('CP-18-07: the notification shows the task title with text from locales/es.json', () => {
    make('Revisar PR', at(9));
    clock = local(9);
    scheduler().start();

    expect(shown[0]).toEqual({
      title: 'Revisar PR',
      body: es.reminders.notification.body.replace('{{time}}', '09:00'),
    });
  });

  it('CP-18-08: shows nothing while reminders are turned off', () => {
    make('Silenciada', at(9));
    setRemindersEnabled(db, false);
    const s = scheduler();
    s.start();
    clock = local(9, 30);
    s.refresh();

    expect(shown).toHaveLength(0);
    expect(active()).toHaveLength(0);
  });

  it('CP-18-10: keeps a single timer aimed at the nearest reminder', () => {
    make('Tarde', at(15));
    make('Pronto', at(9));
    make('Medio', at(12));
    const s = scheduler();
    s.start();
    s.refresh();

    expect(active()).toHaveLength(1);
    expect(active()[0]!.ms).toBe(60 * 60 * 1000);

    clock = local(9);
    active()[0]!.run();
    expect(active()).toHaveLength(1);
    expect(active()[0]!.ms).toBe(3 * 60 * 60 * 1000);
  });

  it('CP-18-10: a far-away reminder never exceeds the timer limit', () => {
    make('Lejana', '2030-01-01T09:00');
    scheduler().start();
    expect(active()[0]!.ms).toBeLessThanOrEqual(2 ** 31 - 1);
  });

  it('CP-N10-03: with no pending reminders there is no polling interval and no timer', () => {
    const interval = vi.spyOn(globalThis, 'setInterval');
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    try {
      const s = createReminderScheduler({ db, notify: (n) => shown.push(n), now: () => clock });
      s.start();
      s.refresh();
      expect(interval).not.toHaveBeenCalled();
      expect(timeout).not.toHaveBeenCalled();
      s.stop();

      make('Pronto', at(9));
      const armed = createReminderScheduler({ db, notify: (n) => shown.push(n), now: () => clock });
      armed.start();
      armed.refresh();
      expect(interval).not.toHaveBeenCalled();
      expect(timeout).toHaveBeenCalledTimes(2);
      armed.stop();
    } finally {
      interval.mockRestore();
      timeout.mockRestore();
    }
    expect(active()).toHaveLength(0);
  });

  it('CP-N10-04: a reminder beyond the setTimeout limit is re-armed in chunks and never fires early', () => {
    const limit = 2 ** 31 - 1;
    make('Dentro de 40 días', '2026-04-19T08:00');
    const target = new Date(2026, 3, 19, 8, 0, 0).getTime();
    expect(target - clock.getTime()).toBeGreaterThan(limit);
    scheduler().start();

    let chunks = 0;
    while (active().length > 0) {
      const timer = active()[0]!;
      expect(timer.ms).toBeGreaterThan(0);
      expect(timer.ms).toBeLessThanOrEqual(limit);
      clock = new Date(clock.getTime() + timer.ms);
      if (clock.getTime() < target) expect(shown).toHaveLength(0);
      timer.run();
      chunks++;
      expect(chunks).toBeLessThan(10);
    }
    expect(chunks).toBeGreaterThan(1);
    expect(shown).toHaveLength(1);
    expect(clock.getTime()).toBe(target);
  });

  it('stop cancels the timer', () => {
    make('Pronto', at(9));
    const s = scheduler();
    s.start();
    s.stop();
    expect(active()).toHaveLength(0);
  });
});
