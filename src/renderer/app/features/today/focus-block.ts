import { Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Task } from '../../../../shared/tasks';
import { FOCUS_DURATION_MS, FocusTimerService } from './focus-timer.service';

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
  protected readonly progress = computed(() =>
    Math.round((1 - this.timer.remainingMs() / FOCUS_DURATION_MS) * 100),
  );

  protected choose(value: string): void {
    this.timer.select(value === '' ? null : Number(value));
  }
}
