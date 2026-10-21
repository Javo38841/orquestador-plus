import { Component, inject, output, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { RECURRENCE_KINDS, type RecurrenceKind } from '../../../../shared/recurrence';
import type { Task } from '../../../../shared/tasks';
import { TasksStore } from '../tasks/tasks.store';
import { recurrenceLabel } from './recurrence-label';

const SERIES_KINDS = RECURRENCE_KINDS.filter((k) => k !== 'once');

/** "Series recurrentes" tab (RF-06): one row per series with its open instance. */
@Component({
  selector: 'app-series-list',
  imports: [TranslocoPipe],
  template: `
    <div class="mb-3 flex flex-wrap items-center gap-3 text-sm">
      <label class="flex items-center gap-2">
        <span class="text-muted">{{ 'recurrence.filterProject' | transloco }}</span>
        <select
          class="rounded-md border border-line bg-canvas px-2 py-1 text-ink"
          data-testid="series-filter-project"
          (change)="store.seriesProjectFilter.set(toProject($any($event.target).value))"
        >
          <option value="">{{ 'recurrence.allProjects' | transloco }}</option>
          @for (project of store.projects(); track project.id) {
            <option [value]="project.id">{{ project.name }}</option>
          }
        </select>
      </label>
      <label class="flex items-center gap-2">
        <span class="text-muted">{{ 'recurrence.filterKind' | transloco }}</span>
        <select
          class="rounded-md border border-line bg-canvas px-2 py-1 text-ink"
          data-testid="series-filter-kind"
          (change)="store.seriesKindFilter.set(toKind($any($event.target).value))"
        >
          <option value="">{{ 'recurrence.allKinds' | transloco }}</option>
          @for (kind of kinds; track kind) {
            <option [value]="kind">{{ 'recurrence.kinds.' + kind | transloco }}</option>
          }
        </select>
      </label>
    </div>

    @if (store.visibleSeries().length === 0) {
      <p class="rounded-lg border border-line bg-surface px-5 py-4 text-sm text-muted">
        {{ 'recurrence.empty' | transloco }}
      </p>
    } @else {
      <div class="rounded-lg border border-line bg-surface" data-testid="series-list">
        <div
          class="grid grid-cols-[1fr_10rem_10rem_9rem_auto] gap-4 border-b border-line px-5 py-2 text-[11px] font-semibold tracking-widest text-muted uppercase"
        >
          <span>{{ 'tasks.columns.task' | transloco }}</span>
          <span>{{ 'tasks.columns.project' | transloco }}</span>
          <span>{{ 'recurrence.columns.repeat' | transloco }}</span>
          <span>{{ 'recurrence.columns.next' | transloco }}</span>
          <span></span>
        </div>
        @for (task of store.visibleSeries(); track task.seriesId) {
          <div
            class="grid grid-cols-[1fr_10rem_10rem_9rem_auto] items-center gap-4 border-b border-line px-5 py-3 last:border-b-0"
            data-testid="series-row"
          >
            <span class="min-w-0 break-words" data-testid="series-title">{{ task.title }}</span>
            <span>
              <span
                class="rounded-full px-2 py-0.5 text-xs"
                data-testid="series-project"
                [class]="task.projectName ? 'bg-project/20 text-project' : 'bg-line text-muted'"
                >{{ task.projectName ?? ('tasks.loose' | transloco) }}</span
              >
            </span>
            <span>
              <span
                class="rounded-full bg-repeat/20 px-2 py-0.5 text-xs text-repeat"
                data-testid="series-rule"
                >{{ label(task) }}</span
              >
            </span>
            <span class="text-sm text-muted" data-testid="series-next">{{
              task.dueDate ?? ''
            }}</span>
            <span class="flex items-center gap-2 text-sm">
              @if (confirming() === task.seriesId) {
                <span class="text-warn">{{ 'recurrence.confirmDelete' | transloco }}</span>
                <button
                  type="button"
                  class="rounded-md border border-warn px-2 py-1 text-warn"
                  data-testid="series-delete-confirm"
                  (click)="remove(task)"
                >
                  {{ 'tasks.confirmYes' | transloco }}
                </button>
                <button
                  type="button"
                  class="rounded-md border border-line px-2 py-1"
                  (click)="confirming.set(null)"
                >
                  {{ 'tasks.confirmNo' | transloco }}
                </button>
              } @else {
                <button
                  type="button"
                  class="rounded-md border border-line px-2 py-1"
                  data-testid="series-edit"
                  (click)="edit.emit(task)"
                >
                  {{ 'tasks.edit' | transloco }}
                </button>
                <button
                  type="button"
                  class="rounded-md border border-line px-2 py-1"
                  data-testid="series-delete"
                  (click)="confirming.set(task.seriesId)"
                >
                  {{ 'tasks.delete' | transloco }}
                </button>
              }
            </span>
          </div>
        }
      </div>
    }
  `,
})
export class SeriesList {
  protected readonly store = inject(TasksStore);
  private readonly transloco = inject(TranslocoService);
  protected readonly kinds = SERIES_KINDS;
  protected readonly confirming = signal<number | null>(null);
  /** Asks the page to open the form on the series' open instance. */
  readonly edit = output<Task>();

  protected label(task: Task): string {
    return recurrenceLabel(this.transloco, task.recurrence);
  }

  protected toProject(value: string): number | null {
    return value === '' ? null : Number(value);
  }

  protected toKind(value: string): RecurrenceKind | null {
    return (SERIES_KINDS as string[]).includes(value) ? (value as RecurrenceKind) : null;
  }

  protected async remove(task: Task): Promise<void> {
    if (task.seriesId !== null) await this.store.removeSeries(task.seriesId);
    this.confirming.set(null);
  }
}
