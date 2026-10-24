import { Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Task } from '../../../../shared/tasks';
import { FOCUS_MAX_MINUTES, FOCUS_MIN_MINUTES } from '../../../../shared/focus';
import { FOCUS_STEP_MINUTES, FocusTimerService } from './focus-timer.service';

export const FOCUS_SHORTCUTS = [15, 25, 30, 45, 60] as const;

/** Enfoque block of Hoy (RF-17): a pomodoro-style timer tied to a task. */
@Component({
  selector: 'app-focus-block',
  imports: [TranslocoPipe],
  template: `
    <section class="rounded-lg border border-line bg-surface p-4" data-testid="focus">
      <h2
        class="mb-3 text-[11px] font-semibold tracking-widest text-muted uppercase"
        data-testid="focus-session"
      >
        {{ 'focus.title' | transloco }} ·
        {{ 'focus.session' | transloco: { n: (timer.completedSessions() % 4) + 1 } }}
      </h2>
      <span
        class="block text-center font-mono text-5xl"
        data-testid="focus-clock"
        role="timer"
        [attr.aria-label]="'focus.clockLabel' | transloco"
        >{{ timer.clock() }}</span
      >
      <p class="mt-1 text-center text-xs text-muted" data-testid="focus-state">
        {{ 'focus.state.' + timer.state() | transloco }}
      </p>
      <div class="mt-3 flex items-center justify-center gap-2">
        <button
          type="button"
          data-testid="focus-minus"
          [class]="step"
          [disabled]="!timer.canEditDuration()"
          [attr.aria-label]="'focus.decrease' | transloco: { n: stepMinutes }"
          (click)="adjust(-stepMinutes)"
        >
          −
        </button>
        <label class="sr-only" for="focus-minutes">{{ 'focus.minutesLabel' | transloco }}</label>
        <input
          id="focus-minutes"
          data-testid="focus-minutes"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          class="w-16 rounded-md border border-line bg-transparent px-2 py-1 text-center text-sm text-ink outline-none focus:border-accent disabled:opacity-50"
          [value]="draft() ?? timer.durationMinutes()"
          [disabled]="!timer.canEditDuration()"
          [attr.aria-invalid]="error() ? 'true' : null"
          [attr.aria-describedby]="error() ? 'focus-minutes-error' : null"
          (change)="commit($any($event.target).value)"
          (keydown.enter)="commit($any($event.target).value)"
          (keydown.arrowUp)="$event.preventDefault(); adjust(1)"
          (keydown.arrowDown)="$event.preventDefault(); adjust(-1)"
        />
        <span class="text-xs text-muted">{{ 'focus.minutesUnit' | transloco }}</span>
        <button
          type="button"
          data-testid="focus-plus"
          [class]="step"
          [disabled]="!timer.canEditDuration()"
          [attr.aria-label]="'focus.increase' | transloco: { n: stepMinutes }"
          (click)="adjust(stepMinutes)"
        >
          +
        </button>
      </div>
      <div class="mt-2 flex flex-wrap justify-center gap-1">
        @for (minutes of shortcuts; track minutes) {
          <button
            type="button"
            data-testid="focus-shortcut"
            [class]="chip"
            [disabled]="!timer.canEditDuration()"
            [attr.aria-pressed]="timer.durationMinutes() === minutes"
            (click)="choosePreset(minutes)"
          >
            {{ 'focus.shortcut' | transloco: { n: minutes } }}
          </button>
        }
      </div>
      @if (error()) {
        <p
          id="focus-minutes-error"
          class="mt-2 text-center text-sm text-warn"
          data-testid="focus-minutes-error"
          role="alert"
        >
          {{ error() | transloco: { min: minMinutes, max: maxMinutes } }}
        </p>
      }
      <label class="sr-only" for="focus-task">{{ 'focus.task' | transloco }}</label>
      <select
        id="focus-task"
        data-testid="focus-task"
        class="mt-3 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-ink outline-none hover:border-line focus:border-accent"
        [disabled]="timer.state() === 'running' || timer.state() === 'paused'"
        (change)="choose($any($event.target).value)"
      >
        <option value="" [selected]="timer.taskId() === null">
          {{ 'focus.chooseTask' | transloco }}
        </option>
        @for (task of tasks(); track task.id) {
          <option [value]="task.id" [selected]="task.id === timer.taskId()">
            {{ task.title }}
          </option>
        }
      </select>
      <div
        class="mt-3 h-1.5 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        data-testid="focus-progress"
        [attr.aria-label]="'focus.progress' | transloco"
        [attr.aria-valuenow]="progress()"
      >
        <div class="h-full bg-accent" [style.width.%]="progress()"></div>
      </div>
      <div class="mt-4 flex gap-2">
        @switch (timer.state()) {
          @case ('running') {
            <button
              type="button"
              data-testid="focus-pause"
              [class]="primary"
              (click)="timer.pause()"
            >
              {{ 'focus.pause' | transloco }}
            </button>
          }
          @case ('paused') {
            <button
              type="button"
              data-testid="focus-resume"
              [class]="primary"
              (click)="timer.resume()"
            >
              {{ 'focus.resume' | transloco }}
            </button>
          }
          @default {
            <button
              type="button"
              data-testid="focus-start"
              [class]="primary"
              (click)="timer.start()"
            >
              {{ 'focus.start' | transloco }}
            </button>
          }
        }
        <button
          type="button"
          data-testid="focus-reset"
          [class]="button"
          [disabled]="timer.state() === 'idle'"
          (click)="timer.reset()"
        >
          {{ 'focus.reset' | transloco }}
        </button>
      </div>
      @if (timer.state() === 'running' || timer.state() === 'paused') {
        <button
          type="button"
          data-testid="focus-extend"
          class="mt-2 w-full rounded-md border border-line px-3 py-2 text-sm hover:bg-line focus:border-accent disabled:opacity-50"
          [disabled]="!timer.canExtend()"
          (click)="timer.extend()"
        >
          {{ 'focus.extend' | transloco: { n: stepMinutes } }}
        </button>
      }
      @if (timer.needsTask()) {
        <p class="mt-3 text-sm text-warn" data-testid="focus-needs-task" role="alert">
          {{ 'focus.needsTask' | transloco }}
        </p>
      }
      @if (timer.state() === 'finished') {
        <p class="mt-3 text-sm text-accent" data-testid="focus-finished" role="status">
          {{ 'focus.finished' | transloco }}
        </p>
      }
    </section>
  `,
})
export class FocusBlock {
  protected readonly timer = inject(FocusTimerService);
  /** Tasks that can be picked: the unfinished ones shown in Hoy. */
  readonly tasks = input.required<Task[]>();
  protected readonly primary =
    'flex-1 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink disabled:opacity-50';
  protected readonly button =
    'flex-1 rounded-md border border-line px-3 py-2 text-sm hover:bg-line focus:border-accent disabled:opacity-50';
  protected readonly step =
    'h-8 w-8 rounded-md border border-line text-base hover:bg-line focus:border-accent disabled:opacity-50';
  protected readonly chip =
    'rounded-md border border-line px-2 py-1 text-xs hover:bg-line focus:border-accent disabled:opacity-50 aria-pressed:border-accent aria-pressed:text-accent';
  protected readonly shortcuts = FOCUS_SHORTCUTS;
  protected readonly stepMinutes = FOCUS_STEP_MINUTES;
  protected readonly minMinutes = FOCUS_MIN_MINUTES;
  protected readonly maxMinutes = FOCUS_MAX_MINUTES;
  /** What the user typed when it was refused; null shows the chosen duration. */
  protected readonly draft = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly progress = computed(() =>
    Math.min(
      100,
      Math.max(0, Math.round((1 - this.timer.remainingMs() / this.timer.totalMs()) * 100)),
    ),
  );

  constructor() {
    void this.timer.load();
  }

  protected adjust(delta: number): void {
    if (this.timer.adjustDuration(delta)) this.clearError();
  }

  protected choosePreset(minutes: number): void {
    if (this.timer.setDuration(minutes)) this.clearError();
  }

  protected commit(raw: string): void {
    const text = raw.trim();
    const minutes = /^\d+$/.test(text) ? Number(text) : NaN;
    if (this.timer.setDuration(minutes)) {
      this.clearError();
    } else if (this.timer.canEditDuration()) {
      this.draft.set(raw);
      this.error.set('focus.minutesInvalid');
    }
  }

  private clearError(): void {
    this.draft.set(null);
    this.error.set(null);
  }

  protected choose(value: string): void {
    this.timer.select(value === '' ? null : Number(value));
  }
}
