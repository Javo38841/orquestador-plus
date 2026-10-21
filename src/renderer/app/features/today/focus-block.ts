import { Component, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Task } from '../../../../shared/tasks';
import { FocusTimerService } from './focus-timer.service';

/** Enfoque block of Hoy (RF-17): a pomodoro-style timer tied to a task. */
@Component({
  selector: 'app-focus-block',
  imports: [TranslocoPipe],
  template: `
    <section class="mb-6 rounded-lg border border-line bg-surface px-5 py-4" data-testid="focus">
      <h2 class="mb-3 text-[11px] font-semibold tracking-widest text-muted uppercase">
        {{ 'focus.title' | transloco }}
      </h2>
      <div class="flex flex-wrap items-center gap-4">
        <span
          class="font-mono text-3xl"
          data-testid="focus-clock"
          role="timer"
          [attr.aria-label]="'focus.clockLabel' | transloco"
          >{{ timer.clock() }}</span
        >
        <span class="text-sm text-muted" data-testid="focus-state">{{
          'focus.state.' + timer.state() | transloco
        }}</span>
        <label class="sr-only" for="focus-task">{{ 'focus.task' | transloco }}</label>
        <select
          id="focus-task"
          data-testid="focus-task"
          class="min-w-0 rounded-md border border-line bg-canvas px-3 py-2 text-ink outline-none focus:border-accent"
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
        @switch (timer.state()) {
          @case ('running') {
            <button
              type="button"
              data-testid="focus-pause"
              [class]="button"
              (click)="timer.pause()"
            >
              {{ 'focus.pause' | transloco }}
            </button>
          }
          @case ('paused') {
            <button
              type="button"
              data-testid="focus-resume"
              [class]="button"
              (click)="timer.resume()"
            >
              {{ 'focus.resume' | transloco }}
            </button>
          }
          @default {
            <button
              type="button"
              data-testid="focus-start"
              [class]="button"
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
  protected readonly button =
    'rounded-md border border-line px-3 py-2 text-sm hover:bg-line focus:border-accent disabled:opacity-50';

  protected choose(value: string): void {
    this.timer.select(value === '' ? null : Number(value));
  }
}
