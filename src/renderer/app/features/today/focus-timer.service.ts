import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import {
  FOCUS_DEFAULT_MINUTES,
  FOCUS_MAX_MINUTES,
  FOCUS_MIN_MINUTES,
  isFocusMinutes,
} from '../../../../shared/focus';
import { DESKTOP_API } from '../../core/desktop-api';
import { TasksStore } from '../tasks/tasks.store';

const MINUTE_MS = 60 * 1000;
/** Step of the −/+ buttons and of "+5 min". */
export const FOCUS_STEP_MINUTES = 5;
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
 * make it drift (RNF-10). While the window is hidden or minimized the periodic tick is
 * stopped; the clock is recomputed when it shows again.
 */
@Injectable({ providedIn: 'root' })
export class FocusTimerService {
  private readonly tasksStore = inject(TasksStore);
  private readonly document = inject(DOCUMENT);
  private readonly api = inject(DESKTOP_API);
  private loaded = false;
  private endAt = 0;
  private handle: ReturnType<typeof setInterval> | null = null;

  readonly state = signal<FocusState>('idle');
  readonly taskId = signal<number | null>(null);
  /** Chosen duration in minutes (the saved preference). */
  readonly durationMinutes = signal(FOCUS_DEFAULT_MINUTES);
  /** Minutes added to the current session with "+5 min"; never saved. */
  readonly extraMinutes = signal(0);
  /** Length of the current session, extras included. */
  readonly totalMs = computed(() => (this.durationMinutes() + this.extraMinutes()) * MINUTE_MS);
  readonly remainingMs = signal(FOCUS_DEFAULT_MINUTES * MINUTE_MS);
  /** The duration can only be edited while no session is running or paused. */
  readonly canEditDuration = computed(
    () => this.state() !== 'running' && this.state() !== 'paused',
  );
  readonly canExtend = computed(
    () =>
      !this.canEditDuration() &&
      this.durationMinutes() + this.extraMinutes() + FOCUS_STEP_MINUTES <= FOCUS_MAX_MINUTES,
  );
  /** Set when a start was refused because no task was chosen. */
  readonly needsTask = signal(false);
  /** Sessions that ran to the end since the app opened; drives "SESIÓN n DE 4". */
  readonly completedSessions = signal(0);
  readonly clock = computed(() => formatClock(this.remainingMs()));

  constructor() {
    const onVisibility = () => this.onVisibilityChange();
    this.document.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('visibilitychange', onVisibility);
      this.stopTicking();
    });

    // The session ends when its task is completed or deleted.
    effect(() => {
      const id = this.taskId();
      const tasks = this.tasksStore.tasks();
      if (id === null || this.state() === 'idle') return;
      const task = tasks.find((t) => t.id === id);
      if (!task || task.status === 'done') this.reset();
    });
  }

  /** Loads the saved duration once; a failure keeps the default. */
  async load(): Promise<void> {
    if (this.loaded || !this.api) return;
    this.loaded = true;
    try {
      const minutes = await this.api.getFocusMinutes();
      if (isFocusMinutes(minutes) && this.canEditDuration() && this.state() !== 'finished') {
        this.durationMinutes.set(minutes);
        this.remainingMs.set(minutes * MINUTE_MS);
      }
    } catch {
      // Keep the default duration.
    }
  }

  /**
   * Chooses the duration for the next sessions and saves it. Ignored while a session runs
   * or is paused, and for anything but an integer from 1 to 180. Returns whether it applied.
   */
  setDuration(minutes: number): boolean {
    if (!this.canEditDuration() || !isFocusMinutes(minutes)) return false;
    this.durationMinutes.set(minutes);
    this.extraMinutes.set(0);
    this.remainingMs.set(minutes * MINUTE_MS);
    this.state.set('idle');
    void this.api?.setFocusMinutes(minutes).catch(() => undefined);
    return true;
  }

  /** Moves the duration by `delta` minutes, kept within 1 to 180. */
  adjustDuration(delta: number): boolean {
    const next = Math.min(
      FOCUS_MAX_MINUTES,
      Math.max(FOCUS_MIN_MINUTES, this.durationMinutes() + delta),
    );
    return this.setDuration(next);
  }

  /** Adds 5 minutes to the session in progress or paused, up to 180 in total. */
  extend(): void {
    if (!this.canExtend()) return;
    if (this.state() === 'running') {
      this.refresh();
      if (this.state() !== 'running') return;
      this.endAt += FOCUS_STEP_MINUTES * MINUTE_MS;
    }
    this.extraMinutes.update((m) => m + FOCUS_STEP_MINUTES);
    this.remainingMs.update((ms) => ms + FOCUS_STEP_MINUTES * MINUTE_MS);
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
    this.extraMinutes.set(0);
    this.remainingMs.set(this.durationMinutes() * MINUTE_MS);
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
    this.extraMinutes.set(0);
    this.remainingMs.set(this.durationMinutes() * MINUTE_MS);
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
      this.completedSessions.update((n) => n + 1);
    } else {
      this.remainingMs.set(left);
    }
  }

  private run(): void {
    this.stopTicking();
    this.endAt = Date.now() + this.remainingMs();
    this.state.set('running');
    this.startTicking();
  }

  private startTicking(): void {
    if (this.handle !== null || this.document.visibilityState === 'hidden') return;
    this.handle = setInterval(() => this.refresh(), TICK_MS);
  }

  private onVisibilityChange(): void {
    if (this.state() !== 'running') return;
    if (this.document.visibilityState === 'hidden') {
      this.stopTicking();
    } else {
      this.refresh();
      if (this.state() === 'running') this.startTicking();
    }
  }

  private stopTicking(): void {
    if (this.handle !== null) clearInterval(this.handle);
    this.handle = null;
  }
}
