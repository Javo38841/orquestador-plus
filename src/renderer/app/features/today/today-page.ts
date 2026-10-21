import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, OnInit } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { Task } from '../../../../shared/tasks';
import { dueLabel, formatLongDate, todayGroups } from '../../../../shared/today';
import { TasksStore } from '../tasks/tasks.store';

/** Hoy (RF-03): overdue tasks and what is due or marked for today. */
@Component({
  selector: 'app-today-page',
  imports: [TranslocoPipe, NgTemplateOutlet],
  template: `
    <header class="mb-8">
      <h1 class="text-2xl font-semibold">{{ 'nav.today' | transloco }}</h1>
      <p class="mt-1 text-sm text-muted" data-testid="today-subtitle">{{ subtitle() }}</p>
    </header>

    @if (groups().overdue.length === 0 && groups().today.length === 0) {
      <p class="rounded-lg border border-line bg-surface px-5 py-4 text-sm text-muted">
        {{ 'today.empty' | transloco }}
      </p>
    }

    @if (groups().overdue.length > 0) {
      <section class="mb-6" data-testid="today-overdue">
        <h2 class="mb-2 text-[11px] font-semibold tracking-widest text-warn uppercase">
          {{ 'today.overdue' | transloco }}
        </h2>
        <ng-container *ngTemplateOutlet="list; context: { $implicit: groups().overdue }" />
      </section>
    }

    @if (groups().today.length > 0) {
      <section class="mb-6" data-testid="today-list">
        <h2 class="mb-2 text-[11px] font-semibold tracking-widest text-muted uppercase">
          {{ 'today.forToday' | transloco }}
        </h2>
        <ng-container *ngTemplateOutlet="list; context: { $implicit: groups().today }" />
      </section>
    }

    <ng-template #list let-tasks>
      <div class="rounded-lg border border-line bg-surface">
        @for (task of tasks; track task.id) {
          <div
            class="flex items-center gap-4 border-b border-line px-5 py-3 last:border-b-0"
            data-testid="today-task"
          >
            <input
              type="checkbox"
              data-testid="today-check"
              [attr.aria-label]="'tasks.complete' | transloco"
              (change)="store.setDone(task, $any($event.target).checked)"
            />
            <span class="min-w-0 flex-1 break-words">{{ task.title }}</span>
            @for (tag of task.tags; track tag) {
              <span
                class="rounded-full bg-line px-2 py-0.5 text-xs text-muted"
                data-testid="today-tag"
                >#{{ tag }}</span
              >
            }
            <span
              class="rounded-full px-2 py-0.5 text-xs"
              [class]="task.projectName ? 'bg-project/20 text-project' : 'bg-line text-muted'"
              >{{ task.projectName ?? ('tasks.loose' | transloco) }}</span
            >
            @if (relative(task); as label) {
              <span
                class="text-sm"
                data-testid="today-due"
                [class.text-warn]="isOverdue(task)"
                [class.text-muted]="!isOverdue(task)"
                >{{ label }}</span
              >
            }
          </div>
        }
      </div>
    </ng-template>
  `,
})
export class TodayPage implements OnInit {
  protected readonly store = inject(TasksStore);
  private readonly transloco = inject(TranslocoService);
  protected readonly groups = computed(() => todayGroups(this.store.tasks()));

  protected readonly subtitle = computed(() => {
    const { overdue, today } = this.groups();
    const count = (key: string, n: number) =>
      this.transloco.translate(n === 1 ? `${key}One` : key, { count: n });
    return this.transloco.translate('today.subtitle', {
      date: formatLongDate(),
      pending: count('today.pending', overdue.length + today.length),
      overdue: count('today.overdueCount', overdue.length),
    });
  });

  ngOnInit(): void {
    void this.store.load();
  }

  protected isOverdue(task: Task): boolean {
    return this.groups().overdue.includes(task);
  }

  protected relative(task: Task): string | null {
    const label = dueLabel(task.dueDate);
    if (!label) return null;
    if (label.kind === 'today') return this.transloco.translate('today.dueToday');
    if (label.kind === 'yesterday') return this.transloco.translate('today.dueYesterday');
    return this.transloco.translate('today.dueDaysAgo', { days: label.days });
  }
}
