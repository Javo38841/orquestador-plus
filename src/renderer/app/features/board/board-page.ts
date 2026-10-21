import {
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { BOARD_COLUMNS, buildBoard } from '../../../../shared/board';
import { isOverdue, localDate, type Task, type TaskStatus } from '../../../../shared/tasks';
import { TasksStore } from '../tasks/tasks.store';

const COLUMN_KEYS: Record<TaskStatus, string> = {
  todo: 'board.columns.todo',
  in_progress: 'board.columns.inProgress',
  done: 'board.columns.done',
};

/** Kanban board (RF-04, RF-05): general or per project, with tag filters. */
@Component({
  selector: 'app-board-page',
  imports: [TranslocoPipe],
  template: `
    <header class="mb-6">
      <h1 class="text-2xl font-semibold">{{ 'nav.board' | transloco }}</h1>
      <p class="mt-1 text-sm text-muted">{{ 'pages.board' | transloco }}</p>
    </header>

    <div class="mb-3 flex flex-wrap items-center gap-2 text-sm" data-testid="board-projects">
      <button
        type="button"
        class="rounded-full border px-3 py-0.5 text-xs"
        data-testid="board-filter-active"
        [class]="projectFilter() === null ? 'border-accent text-accent' : 'border-line'"
        [attr.aria-pressed]="projectFilter() === null"
        (click)="projectFilter.set(null)"
      >
        {{ 'board.active' | transloco }}
      </button>
      @for (project of store.projects(); track project.id) {
        <button
          type="button"
          class="rounded-full border px-3 py-0.5 text-xs"
          data-testid="board-filter-project"
          [class]="projectFilter() === project.id ? 'border-accent text-accent' : 'border-line'"
          [attr.aria-pressed]="projectFilter() === project.id"
          (click)="projectFilter.set(project.id)"
        >
          {{ project.name }}
        </button>
      }
    </div>
    @if (store.tags().length > 0) {
      <div class="mb-4 flex flex-wrap items-center gap-2 text-sm" data-testid="board-tags">
        <span class="text-muted">{{ 'tasks.filterByTag' | transloco }}</span>
        @for (tag of store.tags(); track tag) {
          <button
            type="button"
            class="rounded-full border px-2 py-0.5 text-xs"
            data-testid="board-filter-tag"
            [class]="tagFilter() === tag ? 'border-accent text-accent' : 'border-line'"
            [attr.aria-pressed]="tagFilter() === tag"
            (click)="tagFilter.set(tagFilter() === tag ? null : tag)"
          >
            #{{ tag }}
          </button>
        }
      </div>
    }

    <div class="grid grid-cols-3 gap-4">
      @for (status of columns; track status) {
        <section
          class="min-h-40 rounded-lg border border-line bg-surface p-3"
          data-testid="board-column"
          [attr.data-status]="status"
          [attr.aria-label]="columnKey(status) | transloco"
          (dragover)="$event.preventDefault()"
          (drop)="drop($event, status)"
        >
          <h2
            class="mb-3 flex items-center justify-between text-[11px] font-semibold tracking-widest text-muted uppercase"
          >
            <span>{{ columnKey(status) | transloco }}</span>
            <span data-testid="board-count">{{ board()[status].length }}</span>
          </h2>
          <div class="space-y-2">
            @for (task of board()[status]; track task.id) {
              <article
                class="rounded-md border border-line bg-surface-raised p-3 text-sm"
                data-testid="board-card"
                [attr.data-task-id]="task.id"
                draggable="true"
                (dragstart)="$event.dataTransfer?.setData('text/plain', '' + task.id)"
              >
                <p
                  class="break-words"
                  [class.line-through]="task.status === 'done'"
                  [class.text-muted]="task.status === 'done'"
                >
                  {{ task.title }}
                </p>
                <div class="mt-2 flex flex-wrap items-center gap-1 text-xs">
                  <span
                    class="rounded-full px-2 py-0.5"
                    data-testid="board-card-project"
                    [class]="task.projectName ? 'bg-project/20 text-project' : 'bg-line text-muted'"
                    >{{ task.projectName ?? ('tasks.loose' | transloco) }}</span
                  >
                  @for (tag of task.tags; track tag) {
                    <span class="rounded-full bg-line px-2 py-0.5 text-muted">#{{ tag }}</span>
                  }
                  @if (task.dueDate) {
                    <span [class]="overdue(task) ? 'text-warn' : 'text-muted'">{{
                      task.dueDate
                    }}</span>
                  }
                </div>
                <div class="relative mt-2">
                  <button
                    type="button"
                    class="rounded-md border border-line px-2 py-1 text-xs"
                    data-testid="board-move"
                    aria-haspopup="menu"
                    [attr.aria-expanded]="menuFor() === task.id"
                    (click)="toggleMenu(task, $event)"
                  >
                    {{ 'board.move' | transloco }}
                  </button>
                  @if (menuFor() === task.id) {
                    <div
                      role="menu"
                      class="absolute z-10 mt-1 flex min-w-36 flex-col rounded-md border border-line bg-surface-raised p-1 shadow-lg"
                      data-testid="board-move-menu"
                    >
                      @for (target of targets(task); track target) {
                        <button
                          type="button"
                          role="menuitem"
                          class="rounded px-2 py-1 text-left text-xs hover:bg-line focus:bg-line"
                          data-testid="board-move-option"
                          [attr.data-status]="target"
                          (click)="move(task, target)"
                        >
                          {{ columnKey(target) | transloco }}
                        </button>
                      }
                    </div>
                  }
                </div>
              </article>
            } @empty {
              <p class="text-xs text-muted">{{ 'board.emptyColumn' | transloco }}</p>
            }
          </div>
        </section>
      }
    </div>
  `,
})
export class BoardPage implements OnInit {
  protected readonly store = inject(TasksStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly columns = BOARD_COLUMNS;
  /** Null is "Activas" (all tasks); otherwise the id of the project being shown. */
  readonly projectFilter = signal<number | null>(null);
  readonly tagFilter = signal<string | null>(null);
  protected readonly menuFor = signal<number | null>(null);
  protected readonly board = computed(() =>
    buildBoard(this.store.tasks(), { projectId: this.projectFilter(), tag: this.tagFilter() }),
  );

  ngOnInit(): void {
    void this.store.load().then(() => {
      // A filter whose project or tag vanished would show an empty board.
      const project = this.projectFilter();
      if (project !== null && !this.store.projects().some((p) => p.id === project)) {
        this.projectFilter.set(null);
      }
      const tag = this.tagFilter();
      if (tag !== null && !this.store.tags().includes(tag)) this.tagFilter.set(null);
    });
  }

  protected columnKey(status: TaskStatus): string {
    return COLUMN_KEYS[status];
  }

  protected overdue(task: Task): boolean {
    return isOverdue(task, localDate());
  }

  protected targets(task: Task): TaskStatus[] {
    return BOARD_COLUMNS.filter((s) => s !== task.status);
  }

  /** Opens the "Mover a…" menu and focuses its first option so it works with the keyboard alone. */
  protected toggleMenu(task: Task, event: Event): void {
    if (this.menuFor() === task.id) {
      this.menuFor.set(null);
      return;
    }
    this.menuFor.set(task.id);
    const trigger = event.currentTarget as HTMLElement;
    setTimeout(() => {
      trigger.parentElement?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
  }

  /** Escape closes the open menu and hands focus back to the button that opened it. */
  @HostListener('keydown.escape')
  protected closeMenu(): void {
    const open = this.menuFor();
    if (open === null) return;
    this.menuFor.set(null);
    this.host.nativeElement
      .querySelector<HTMLElement>(`[data-task-id="${open}"] [data-testid="board-move"]`)
      ?.focus();
  }

  protected async move(task: Task, status: TaskStatus): Promise<void> {
    this.menuFor.set(null);
    await this.store.move(task, status);
    // The card was re-rendered in its new column: give focus back to its "Mover a…" button.
    setTimeout(() =>
      this.host.nativeElement
        .querySelector<HTMLElement>(`[data-task-id="${task.id}"] [data-testid="board-move"]`)
        ?.focus(),
    );
  }

  protected drop(event: DragEvent, status: TaskStatus): void {
    event.preventDefault();
    const id = Number(event.dataTransfer?.getData('text/plain'));
    const task = this.store.tasks().find((t) => t.id === id);
    if (task && task.status !== status) void this.store.move(task, status);
  }
}
