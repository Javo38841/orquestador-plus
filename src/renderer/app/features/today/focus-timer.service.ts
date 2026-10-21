import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { TasksStore } from '../tasks/tasks.store';

export const FOCUS_DURATION_MS = 25 * 60 * 1000;
const TICK_MS = 250;

export type FocusState = 'idle' | 'running' | 'paused' | 'finished';

/** Formats milliseconds as `mm:ss`, rounding up so 00:00 only shows once time is over. */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Focus timer (RF-17). App-scoped so a session survives switching screens. The remaining
 * time comes from an end instant, not from counting ticks, so throttled timers do not
 * make it drift (RNF-10).
 */
@Injectable({ providedIn: 'root' })
export class FocusTimerService {
  private readonly tasksStore = inject(TasksStore);
  private endAt = 0;
  private handle: ReturnType<typeof setInterval> | null = null;

  readonly state = signal<FocusState>('idle');
  readonly taskId = signal<number | null>(null);
  readonly remainingMs = signal(FOCUS_DURATION_MS);
  /** Set when a start was refused because no task was chosen. */
  readonly needsTask = signal(false);
  readonly clock = computed(() => formatClock(this.remainingMs()));

  constructor() {
    // The session ends when its task is completed or deleted.
    effect(() => {
      const id = this.taskId();
      const tasks = this.tasksStore.tasks();
      if (id === null || this.state() === 'idle') return;
      const task = tasks.find((t) => t.id === id);
      if (!task || task.status === 'done') this.reset();
    });
  }

  select(id: number | null): void {
    this.taskId.set(id);
    if (id !== null) this.needsTask.set(false);
  }

  start(): boolean {
    if (this.taskId() === null) {
      this.needsTask.set(true);
      return false;
    }
    this.needsTask.set(false);
    this.remainingMs.set(FOCUS_DURATION_MS);
    this.run();
    return true;
  }

  pause(): void {
    if (this.state() !== 'running') return;
    this.refresh();
    if (this.state() !== 'running') return;
    this.stopTicking();
    this.state.set('paused');
  }

  resume(): void {
    if (this.state() === 'paused') this.run();
  }

  /** Back to the full duration, stopped. Keeps the chosen task. */
  reset(): void {
    this.stopTicking();
    this.remainingMs.set(FOCUS_DURATION_MS);
    this.state.set('idle');
  }

  /** Recomputes the remaining time from the clock; ends the session at zero. */
  refresh(): void {
    if (this.state() !== 'running') return;
    const left = this.endAt - Date.now();
    if (left <= 0) {
      this.stopTicking();
      this.remainingMs.set(0);
      this.state.set('finished');
    } else {
      this.remainingMs.set(left);
    }
  }

  private run(): void {
    this.stopTicking();
    this.endAt = Date.now() + this.remainingMs();
    this.state.set('running');
    this.handle = setInterval(() => this.refresh(), TICK_MS);
  }

  private stopTicking(): void {
    if (this.handle !== null) clearInterval(this.handle);
    this.handle = null;
  }
}
