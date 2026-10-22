import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { Task } from '../../../../shared/tasks';
import { formatLongDate, todayGroups, tomorrowTasks } from '../../../../shared/today';
import { validateCapture } from '../../../../shared/inbox';
import { PrimaryButton } from '../../shared/ui/primary-button';
import { ProjectChip } from '../../shared/ui/project-chip';
import { RelativeDate } from '../../shared/ui/relative-date';
import { RepeatChip } from '../../shared/ui/repeat-chip';
import { TagChip } from '../../shared/ui/tag-chip';
import { InboxStore } from '../inbox/inbox.store';
import { recurrenceLabel } from '../recurrence/recurrence-label';
import { FocusBlock } from './focus-block';
import { TasksStore } from '../tasks/tasks.store';

/** Hoy (RF-03): overdue tasks and what is due or marked for today. */
@Component({
  selector: 'app-today-page',
  imports: [
    TranslocoPipe,
    NgTemplateOutlet,
    FocusBlock,
    PrimaryButton,
    ProjectChip,
    TagChip,
    RepeatChip,
    RelativeDate,
  ],
  template: `
    <header class="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold">{{ 'nav.today' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted" data-testid="today-subtitle">{{ subtitle() }}</p>
      </div>
      <app-primary-button icon="+" [label]="'today.newTask' | transloco" (pressed)="newTask()" />
    </header>

    <div class="mb-6 flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2">
      <input
        type="text"
        class="min-w-0 flex-1 bg-transparent py-1 text-ink outline-none"
        data-testid="today-capture"
        [placeholder]="'today.capture.placeholder' | transloco"
        [attr.aria-label]="'today.capture.label' | transloco"
        [value]="captureText()"
        (input)="captureText.set($any($event.target).value)"
        (keydown.enter)="capture()"
      />
      <kbd class="font-mono text-xs text-muted">{{ 'today.capture.shortcut' | transloco }}</kbd>
    </div>
    @if (captureError(); as key) {
      <p class="-mt-4 mb-6 text-sm text-warn" role="alert" data-testid="today-capture-error">
        {{ key | transloco }}
      </p>
    }

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" data-testid="today-columns">
      <div data-testid="today-main">
        @if (groups().overdue.length === 0 && groups().today.length === 0) {
          <p class="rounded-lg border border-line bg-surface px-5 py-4 text-sm text-muted">
            {{ 'today.empty' | transloco }}
          </p>
        }

        @if (groups().overdue.length > 0) {
          <section class="mb-6" data-testid="today-overdue">
            <h2
              class="mb-2 text-[11px] font-semibold tracking-widest text-warn uppercase"
              data-testid="today-overdue-title"
            >
              {{ 'today.overdueTitle' | transloco: { count: groups().overdue.length } }}
            </h2>
            <ng-container *ngTemplateOutlet="list; context: { $implicit: groups().overdue }" />
          </section>
        }

        @if (groups().today.length > 0) {
          <section class="mb-6" data-testid="today-list">
            <h2
              class="mb-2 text-[11px] font-semibold tracking-widest text-muted uppercase"
              data-testid="today-list-title"
            >
              {{ 'today.forTodayTitle' | transloco: { count: groups().today.length } }}
            </h2>
            <ng-container *ngTemplateOutlet="list; context: { $implicit: groups().today }" />
          </section>
        }
      </div>

      <aside class="space-y-4" data-testid="today-side">
        <app-focus-block [tasks]="pending()" />

        <section class="rounded-lg border border-line bg-surface p-4" data-testid="today-tomorrow">
          <h2 class="mb-2 text-[11px] font-semibold tracking-widest text-muted uppercase">
            {{ 'today.tomorrow.title' | transloco }}
          </h2>
          @for (task of tomorrow(); track task.id) {
            <p class="py-1 text-sm break-words" data-testid="tomorrow-task">{{ task.title }}</p>
          } @empty {
            <p class="text-sm text-muted" data-testid="tomorrow-empty">
              {{ 'today.tomorrow.empty' | transloco }}
            </p>
          }
        </section>

        @if (portalCount() > 0) {
          <section class="rounded-lg border border-line bg-surface p-4" data-testid="today-portal">
            <h2 class="mb-2 text-[11px] font-semibold tracking-widest text-warn uppercase">
              {{ 'today.portal.title' | transloco }}
            </h2>
            <p class="text-sm" data-testid="portal-pending">{{ portalText() }}</p>
          </section>
        }
      </aside>
    </div>

    <ng-template #list let-tasks>
      <div class="space-y-2">
        @for (task of tasks; track task.id) {
          <div
            class="flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-2.5"
            data-testid="today-task"
          >
            <input
              type="checkbox"
              class="mt-1"
              data-testid="today-check"
              [attr.aria-label]="'tasks.complete' | transloco"
              (change)="store.setDone(task, $any($event.target).checked)"
            />
            <div class="min-w-0 flex-1">
              <span class="break-words">{{ task.title }}</span>
              <div class="mt-1 flex flex-wrap items-center gap-1.5">
                <app-project-chip [name]="task.projectName" />
                @for (tag of task.tags; track tag) {
                  <span data-testid="today-tag"><app-tag-chip [tag]="tag" /></span>
                }
                @if (repeatLabel(task); as label) {
                  <app-repeat-chip [label]="label" />
                }
              </div>
            </div>
            <span class="shrink-0 text-sm" data-testid="today-due">
              <app-relative-date [date]="task.dueDate" [compact]="true" />
            </span>
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

  private readonly inbox = inject(InboxStore);
  private readonly router = inject(Router);
  protected readonly captureText = signal('');
  protected readonly captureError = signal<string | null>(null);
  protected readonly tomorrow = computed(() => tomorrowTasks(this.store.tasks()));
  protected readonly portalCount = computed(
    () => this.inbox.items().filter((i) => i.source === 'portal').length,
  );
  protected readonly portalText = computed(() =>
    this.transloco.translate(
      this.portalCount() === 1 ? 'today.portal.pendingOne' : 'today.portal.pending',
      { count: this.portalCount() },
    ),
  );

  protected readonly pending = computed(() => [...this.groups().overdue, ...this.groups().today]);

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
    void this.inbox.load();
  }

  protected newTask(): void {
    void this.router.navigate(['/tasks'], { queryParams: { new: 1 } });
  }

  protected async capture(): Promise<void> {
    const checked = validateCapture(this.captureText());
    if (!checked.ok) {
      // An empty bar just does nothing; only an over-long text is worth telling about.
      this.captureError.set(checked.error === 'too_long' ? 'capture.tooLong' : null);
      return;
    }
    try {
      const failure = await this.inbox.capture(checked.title);
      this.captureError.set(failure === 'too_long' ? 'capture.tooLong' : null);
      if (failure === null) this.captureText.set('');
    } catch {
      this.captureError.set('capture.failed');
    }
  }

  protected repeatLabel(task: Task): string {
    return recurrenceLabel(this.transloco, task.recurrence);
  }
}
