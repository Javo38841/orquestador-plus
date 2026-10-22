import {
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { BOARD_COLUMNS, buildBoard, type BoardSelection } from '../../../../shared/board';
import {
  isOverdue,
  localDate,
  PROJECT_NAME_MAX_LENGTH,
  type Task,
  type TaskError,
  type TaskStatus,
} from '../../../../shared/tasks';
import { DESKTOP_API } from '../../core/desktop-api';
import { TasksStore } from '../tasks/tasks.store';

const ERROR_KEYS: Partial<Record<TaskError, string>> = {
  empty: 'board.errors.empty',
  too_long: 'board.errors.tooLong',
  duplicate_project: 'board.errors.duplicate',
};

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

    <div class="mb-3 flex items-center gap-2 text-sm">
      <label for="board-select" class="text-muted">{{ 'board.select' | transloco }}</label>
      <select
        id="board-select"
        class="rounded-md border border-line bg-surface-raised px-2 py-1"
        data-testid="board-select"
        [value]="selectValue()"
        (change)="choose($any($event.target).value)"
      >
        <option value="general" [selected]="selectValue() === 'general'">
          {{ 'board.general' | transloco }}
        </option>
        <option value="loose" [selected]="selectValue() === 'loose'">
          {{ 'board.loose' | transloco }}
        </option>
        @for (project of store.projects(); track project.id) {
          <option [value]="project.id" [selected]="selectedProjectId() === project.id">
            {{ project.name }}
          </option>
        }
      </select>
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

    <div class="flex items-start gap-4">
      <div class="grid min-w-0 flex-1 grid-cols-3 gap-4">
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
                      [class]="
                        task.projectName ? 'bg-project/20 text-project' : 'bg-line text-muted'
                      "
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
      <aside
        class="w-56 shrink-0 rounded-lg border border-line bg-surface p-3"
        data-testid="board-projects-panel"
        [attr.aria-labelledby]="'board-projects-title'"
      >
        <h2
          id="board-projects-title"
          class="mb-3 text-[11px] font-semibold tracking-widest text-muted uppercase"
        >
          {{ 'board.projects' | transloco }}
        </h2>
        <ul class="mb-3 space-y-1 text-sm">
          @for (project of store.projects(); track project.id) {
            <li>
              <button
                type="button"
                class="w-full rounded px-2 py-1 text-left hover:bg-line"
                data-testid="board-project-item"
                [class]="selectedProjectId() === project.id ? 'text-accent' : ''"
                [attr.aria-pressed]="selectedProjectId() === project.id"
                (click)="choose('' + project.id)"
              >
                {{ project.name }}
              </button>
            </li>
          } @empty {
            <li class="text-xs text-muted">{{ 'board.noProjects' | transloco }}</li>
          }
        </ul>
        <form
          class="space-y-2"
          data-testid="project-form"
          (submit)="$event.preventDefault(); createProject()"
        >
          <label for="board-new-project" class="block text-xs text-muted">{{
            'board.newProject' | transloco
          }}</label>
          <input
            id="board-new-project"
            type="text"
            class="w-full rounded-md border border-line bg-surface-raised px-2 py-1 text-sm"
            data-testid="project-name"
            autocomplete="off"
            [placeholder]="'board.newProjectPlaceholder' | transloco"
            #nameInput
            (input)="draft.set($any($event.target).value)"
          />
          @if (error(); as key) {
            <p class="text-xs text-warn" role="alert" data-testid="project-error">
              {{ key | transloco: { max: maxLength } }}
            </p>
          }
          <button
            type="submit"
            class="rounded-md border border-line px-2 py-1 text-xs"
            data-testid="project-create"
          >
            {{ 'board.create' | transloco }}
          </button>
        </form>
      </aside>
    </div>
  `,
})
export class BoardPage implements OnInit {
  protected readonly store = inject(TasksStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly columns = BOARD_COLUMNS;
  /** The board being shown: "General", the loose tasks, or a single project. */
  readonly boardSelection = signal<BoardSelection>('general');
  protected readonly selectedProjectId = computed(() => {
    const board = this.boardSelection();
    return typeof board === 'object' ? board.projectId : null;
  });
  protected readonly selectValue = computed(() => {
    const board = this.boardSelection();
    return typeof board === 'object' ? '' + board.projectId : board;
  });
  protected readonly draft = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly maxLength = PROJECT_NAME_MAX_LENGTH;
  private readonly api = inject(DESKTOP_API);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  readonly tagFilter = signal<string | null>(null);
  protected readonly menuFor = signal<number | null>(null);
  protected readonly board = computed(() =>
    buildBoard(this.store.tasks(), { board: this.boardSelection(), tag: this.tagFilter() }),
  );

  ngOnInit(): void {
    void this.restore();
  }

  /** Loads the data and reopens the last board; a project that vanished falls back to "General". */
  private async restore(): Promise<void> {
    await this.store.load();
    const current = this.boardSelection();
    const saved =
      current !== 'general' ? current : ((await this.api?.getBoardProject()) ?? 'general');
    const missing =
      typeof saved === 'object' && !this.store.projects().some((p) => p.id === saved.projectId);
    this.boardSelection.set(missing ? 'general' : saved);
    if (missing) void this.api?.setBoardProject('general');
    // A tag filter whose tag vanished would show an empty board.
    const tag = this.tagFilter();
    if (tag !== null && !this.store.tags().includes(tag)) this.tagFilter.set(null);
  }

  /** Picks a board ('general', 'loose' or a project id) and remembers it for the next launch. */
  protected choose(value: string): void {
    const selection: BoardSelection =
      value === 'general' || value === 'loose' ? value : { projectId: Number(value) };
    this.boardSelection.set(selection);
    void this.api?.setBoardProject(selection);
  }

  protected async createProject(): Promise<void> {
    const result = await this.store.createProject(this.draft());
    if ('error' in result) {
      this.error.set(ERROR_KEYS[result.error] ?? 'board.errors.generic');
      return;
    }
    this.error.set(null);
    this.draft.set('');
    // The input never rendered the typed text through a binding, so clear it directly.
    const input = this.nameInput();
    if (input) input.nativeElement.value = '';
    this.choose('' + result.project.id);
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
