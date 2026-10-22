import { NgTemplateOutlet } from '@angular/common';
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
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  BOARD_COLUMNS,
  buildBoard,
  splitTags,
  type BoardSelection,
} from '../../../../shared/board';
import type { InboxItem } from '../../../../shared/inbox';
import {
  localDate,
  PROJECT_NAME_MAX_LENGTH,
  type Task,
  type TaskError,
  type TaskStatus,
} from '../../../../shared/tasks';
import { DESKTOP_API } from '../../core/desktop-api';
import { CHIP_BASE, CHIP_VARIANTS } from '../../shared/ui/chip-styles';
import { OriginBadge } from '../../shared/ui/origin-badge';
import { ProjectChip } from '../../shared/ui/project-chip';
import { RelativeDate } from '../../shared/ui/relative-date';
import { RepeatChip } from '../../shared/ui/repeat-chip';
import { TagChip } from '../../shared/ui/tag-chip';
import { InboxStore } from '../inbox/inbox.store';
import { recurrenceLabel } from '../recurrence/recurrence-label';
import { TasksStore } from '../tasks/tasks.store';
import { BoardCombo, type ComboOption } from './board-combo';

const ERROR_KEYS: Partial<Record<TaskError, string>> = {
  empty: 'board.errors.empty',
  too_long: 'board.errors.tooLong',
  duplicate_project: 'board.errors.duplicate',
};

const CARD_ERROR_KEYS: Partial<Record<TaskError, string>> = {
  empty: 'tasks.errors.empty',
  too_long: 'tasks.errors.tooLong',
};

type ColumnId = 'inbox' | TaskStatus;

/** Left to right; each column has its own theme color (RNF-17). */
const COLUMNS: { id: ColumnId; key: string; text: string; border: string }[] = [
  { id: 'inbox', key: 'board.columns.inbox', text: 'text-warn', border: 'border-t-warn' },
  { id: 'todo', key: 'board.columns.todo', text: 'text-muted', border: 'border-t-line' },
  {
    id: 'in_progress',
    key: 'board.columns.inProgress',
    text: 'text-project-ink',
    border: 'border-t-project',
  },
  { id: 'done', key: 'board.columns.done', text: 'text-accent', border: 'border-t-accent' },
];

const COLUMN_KEYS: Record<TaskStatus, string> = {
  todo: 'board.columns.todo',
  in_progress: 'board.columns.inProgress',
  done: 'board.columns.done',
};

/** Tag chips shown in a card before the "+N". */
const CARD_TAGS = 2;
const DAY_MS = 24 * 3600 * 1000;

/** Kanban board (RF-04, RF-05, RF-15): "Entrantes" plus the task columns, general or per project. */
@Component({
  selector: 'app-board-page',
  imports: [
    TranslocoPipe,
    NgTemplateOutlet,
    BoardCombo,
    OriginBadge,
    ProjectChip,
    RelativeDate,
    RepeatChip,
    TagChip,
  ],
  template: `
    <header class="mb-6">
      <h1 class="text-2xl font-semibold">{{ 'nav.board' | transloco }}</h1>
      <p class="mt-1 text-sm text-muted">{{ 'pages.board' | transloco }}</p>
    </header>

    <div class="mb-3 flex items-center gap-2 text-sm">
      <span class="text-muted">{{ 'board.select' | transloco }}</span>
      <app-board-combo
        testid="board-select"
        [label]="'board.select' | transloco"
        [options]="boardOptions()"
        [value]="selectValue()"
        (valueChange)="choose($event)"
      />
    </div>
    @if (store.tags().length > 0) {
      <div
        class="mb-4 flex flex-wrap items-center gap-2 text-sm"
        role="group"
        data-testid="board-tags"
        [attr.aria-label]="'board.tagsLabel' | transloco"
      >
        <span class="text-muted">{{ 'tasks.filterByTag' | transloco }}</span>
        @for (tag of tagChips().shown; track tag) {
          <ng-container *ngTemplateOutlet="tagButton; context: { $implicit: tag }" />
        }
        @if (tagChips().rest.length > 0) {
          <div class="relative">
            <button
              type="button"
              [class]="chipClass('neutral')"
              data-testid="board-tags-more"
              aria-haspopup="true"
              [attr.aria-expanded]="moreTags()"
              (click)="moreTags.set(!moreTags())"
            >
              {{ 'board.moreTags' | transloco }}
            </button>
            @if (moreTags()) {
              <div
                class="absolute left-0 z-20 mt-1 flex w-64 flex-wrap gap-2 rounded-lg border border-line bg-surface-raised p-2 shadow-lg"
                data-testid="board-tags-rest"
              >
                @for (tag of tagChips().rest; track tag) {
                  <ng-container *ngTemplateOutlet="tagButton; context: { $implicit: tag }" />
                }
              </div>
            }
          </div>
        }
      </div>
    }
    <ng-template #tagButton let-tag>
      <button
        type="button"
        data-testid="board-filter-tag"
        [class]="chipClass(tagFilter() === tag ? 'success' : 'neutral') + ' font-mono'"
        [attr.aria-pressed]="tagFilter() === tag"
        (click)="tagFilter.set(tagFilter() === tag ? null : tag)"
      >
        #{{ tag }}
      </button>
    </ng-template>

    <div class="flex items-start gap-4">
      <div class="min-w-0 flex-1 overflow-x-auto pb-2" data-testid="board-scroll">
        <div
          class="grid grid-flow-col auto-cols-[minmax(15rem,1fr)] gap-4"
          data-testid="board-grid"
        >
          @for (col of columns; track col.id) {
            <section
              class="min-h-40 rounded-lg border border-t-2 border-line bg-surface p-3"
              [class]="col.border"
              data-testid="board-column"
              [attr.data-status]="col.id"
              [attr.aria-label]="col.key | transloco"
              (dragover)="$event.preventDefault()"
              (drop)="col.id !== 'inbox' && drop($event, col.id)"
            >
              <div class="mb-3 flex items-center justify-between">
                <h2
                  class="text-[11px] font-semibold tracking-widest uppercase"
                  [class]="col.text"
                  data-testid="board-column-title"
                >
                  {{ col.key | transloco }} ·
                  <span data-testid="board-count">{{ count(col.id) }}</span>
                </h2>
                @if (col.id !== 'inbox') {
                  <button
                    type="button"
                    class="flex h-6 w-6 items-center justify-center rounded-md border border-line text-muted hover:border-accent hover:text-accent"
                    data-testid="board-add"
                    [attr.aria-label]="'board.add' | transloco: { column: col.key | transloco }"
                    (click)="startAdd(col.id)"
                  >
                    +
                  </button>
                }
              </div>
              @if (adding() === col.id) {
                <form
                  class="mb-2"
                  data-testid="board-add-form"
                  (submit)="$event.preventDefault(); submitAdd(col.id)"
                >
                  <input
                    type="text"
                    class="w-full rounded-md border border-line bg-canvas px-2 py-1 text-sm outline-none focus:border-accent"
                    data-testid="board-add-input"
                    autocomplete="off"
                    #addInput
                    [placeholder]="'board.addPlaceholder' | transloco"
                    [attr.aria-label]="
                      'board.addTitle' | transloco: { column: col.key | transloco }
                    "
                    (input)="addDraft.set($any($event.target).value); addError.set(null)"
                  />
                  @if (addError(); as key) {
                    <p class="mt-1 text-xs text-warn" role="alert" data-testid="board-add-error">
                      {{ key | transloco }}
                    </p>
                  }
                </form>
              }
              <div class="space-y-2">
                @if (col.id === 'inbox') {
                  @for (item of inbox.portalItems(); track item.id) {
                    <article
                      class="rounded-md border border-line bg-surface-raised p-3 text-sm"
                      data-testid="inbox-card"
                      [attr.data-item-id]="item.id"
                      [attr.aria-label]="item.title"
                    >
                      <p class="break-words">{{ item.title }}</p>
                      <div class="mt-2 flex flex-wrap items-center gap-1.5">
                        <app-origin-badge [label]="'inbox.source.portal' | transloco" />
                        <span [class]="chipClass('neutral')" data-testid="inbox-unreviewed">{{
                          'board.inbox.unreviewed' | transloco
                        }}</span>
                      </div>
                      @if (inboxError()?.id === item.id) {
                        <p class="mt-2 text-xs text-warn" role="alert" data-testid="inbox-error">
                          {{ inboxError()!.key | transloco }}
                        </p>
                      }
                      <div class="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        @if (confirmingDiscard() === item.id) {
                          <span class="text-warn">{{
                            'inbox.classify.confirmDiscard' | transloco
                          }}</span>
                          <button
                            type="button"
                            class="rounded-md border border-warn px-2 py-1 text-warn"
                            data-testid="inbox-discard-confirm"
                            (click)="discard(item)"
                          >
                            {{ 'inbox.classify.confirmYes' | transloco }}
                          </button>
                          <button
                            type="button"
                            class="rounded-md border border-line px-2 py-1"
                            data-testid="inbox-discard-cancel"
                            (click)="confirmingDiscard.set(null)"
                          >
                            {{ 'inbox.classify.confirmNo' | transloco }}
                          </button>
                        } @else {
                          <button
                            type="button"
                            class="rounded-md border border-accent px-2 py-1 text-accent"
                            data-testid="inbox-classify-task"
                            (click)="classify(item)"
                          >
                            {{ 'board.inbox.classifyTask' | transloco }}
                          </button>
                          <button
                            type="button"
                            class="rounded-md border border-line px-2 py-1 text-muted opacity-60"
                            data-testid="inbox-classify-bug"
                            disabled
                            [title]="'inbox.classify.soon' | transloco"
                          >
                            {{ 'board.inbox.classifyBug' | transloco }}
                            <span class="sr-only"> · {{ 'inbox.classify.soon' | transloco }}</span>
                          </button>
                          <button
                            type="button"
                            class="rounded-md border border-line px-2 py-1"
                            data-testid="inbox-discard"
                            (click)="confirmingDiscard.set(item.id)"
                          >
                            {{ 'inbox.classify.discard' | transloco }}
                          </button>
                        }
                      </div>
                    </article>
                  } @empty {
                    <p class="text-xs text-muted">{{ 'board.inbox.empty' | transloco }}</p>
                  }
                } @else {
                  @for (task of board()[col.id]; track task.id) {
                    <article
                      class="group relative rounded-md border border-line bg-surface-raised p-3 text-sm outline-none focus-visible:border-accent"
                      data-testid="board-card"
                      tabindex="0"
                      [attr.data-task-id]="task.id"
                      [attr.aria-label]="task.title"
                      draggable="true"
                      (dragstart)="$event.dataTransfer?.setData('text/plain', '' + task.id)"
                      (keydown.enter)="openFromKey(task, $event)"
                    >
                      <p
                        class="truncate pr-6"
                        data-testid="board-card-title"
                        [class.line-through]="task.status === 'done'"
                        [class.text-muted]="task.status === 'done'"
                      >
                        {{ task.title }}
                      </p>
                      <div class="mt-2 flex items-center gap-1.5 overflow-hidden whitespace-nowrap">
                        <app-project-chip [name]="task.projectName" />
                        @for (tag of task.tags.slice(0, cardTags); track tag) {
                          <span data-testid="board-card-tag"><app-tag-chip [tag]="tag" /></span>
                        }
                        @if (task.tags.length > cardTags) {
                          <span
                            [class]="chipClass('neutral')"
                            data-testid="board-card-more-tags"
                            [title]="task.tags.slice(cardTags).join(', ')"
                            >+{{ task.tags.length - cardTags }}</span
                          >
                        }
                        @if (repeatLabel(task); as label) {
                          <app-repeat-chip [label]="label" />
                        }
                      </div>
                      @if (task.status === 'done') {
                        @if (completedText(task); as text) {
                          <p class="mt-1.5 text-xs text-muted" data-testid="board-card-date">
                            {{ text }}
                          </p>
                        }
                      } @else if (task.dueDate) {
                        <p class="mt-1.5 text-xs" data-testid="board-card-date">
                          <app-relative-date [date]="task.dueDate" [showTomorrow]="true" />
                        </p>
                      }
                      <button
                        type="button"
                        class="absolute top-2 right-2 rounded-md px-1.5 text-muted opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-ink focus:opacity-100"
                        [class.opacity-100]="menuFor() === task.id"
                        data-testid="board-move"
                        tabindex="-1"
                        aria-haspopup="menu"
                        [attr.aria-label]="'board.move' | transloco"
                        [attr.aria-expanded]="menuFor() === task.id"
                        (click)="toggleMenu(task, $event)"
                      >
                        ⋯
                      </button>
                      @if (menuFor() === task.id) {
                        <div
                          role="menu"
                          class="absolute top-8 right-2 z-10 flex min-w-36 flex-col rounded-md border border-line bg-surface-raised p-1 shadow-lg"
                          data-testid="board-move-menu"
                          [attr.aria-label]="'board.move' | transloco"
                        >
                          @for (target of statuses; track target) {
                            <button
                              type="button"
                              role="menuitem"
                              class="rounded px-2 py-1 text-left text-xs hover:bg-line focus:bg-line disabled:text-muted disabled:opacity-50"
                              data-testid="board-move-option"
                              [attr.data-status]="target"
                              [disabled]="target === task.status"
                              (click)="move(task, target)"
                              (keydown)="menuKey($event)"
                            >
                              {{ columnKey(target) | transloco }}
                            </button>
                          }
                        </div>
                      }
                    </article>
                  } @empty {
                    <p class="text-xs text-muted">{{ 'board.emptyColumn' | transloco }}</p>
                  }
                }
              </div>
            </section>
          }
        </div>
      </div>
      <aside
        class="shrink-0 rounded-lg border border-line bg-surface p-3"
        [class]="panelOpen() ? 'w-48' : 'w-12'"
        data-testid="board-projects-panel"
        [attr.data-open]="panelOpen()"
      >
        <div class="flex items-center justify-between">
          @if (panelOpen()) {
            <h2
              id="board-projects-title"
              class="text-[11px] font-semibold tracking-widest text-muted uppercase"
            >
              {{ 'board.projects' | transloco }}
            </h2>
          }
          <button
            type="button"
            class="rounded-md border border-line px-2 text-muted hover:text-ink"
            data-testid="board-panel-toggle"
            aria-controls="board-projects-body"
            [attr.aria-expanded]="panelOpen()"
            [attr.aria-label]="(panelOpen() ? 'board.panelFold' : 'board.panelUnfold') | transloco"
            (click)="togglePanel()"
          >
            {{ panelOpen() ? '›' : '‹' }}
          </button>
        </div>
        @if (panelOpen()) {
          <div id="board-projects-body" class="mt-3" aria-labelledby="board-projects-title">
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
          </div>
        }
      </aside>
    </div>
  `,
})
export class BoardPage implements OnInit {
  protected readonly store = inject(TasksStore);
  protected readonly inbox = inject(InboxStore);
  private readonly transloco = inject(TranslocoService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly columns = COLUMNS;
  protected readonly statuses = BOARD_COLUMNS;
  protected readonly cardTags = CARD_TAGS;
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
  protected readonly boardOptions = computed<ComboOption[]>(() => [
    { value: 'general', label: this.transloco.translate('board.general') },
    { value: 'loose', label: this.transloco.translate('board.loose') },
    ...this.store.projects().map((p) => ({ value: '' + p.id, label: p.name })),
  ]);
  protected readonly draft = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly maxLength = PROJECT_NAME_MAX_LENGTH;
  private readonly api = inject(DESKTOP_API);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  readonly tagFilter = signal<string | null>(null);
  protected readonly moreTags = signal(false);
  protected readonly tagChips = computed(() =>
    splitTags(this.store.tasks(), this.store.tags(), this.tagFilter()),
  );
  protected readonly menuFor = signal<number | null>(null);
  protected readonly panelOpen = signal(true);
  /** Column whose "+" form is open, and its draft. */
  protected readonly adding = signal<TaskStatus | null>(null);
  protected readonly addDraft = signal('');
  protected readonly addError = signal<string | null>(null);
  protected readonly confirmingDiscard = signal<number | null>(null);
  protected readonly inboxError = signal<{ id: number; key: string } | null>(null);
  protected readonly board = computed(() =>
    buildBoard(this.store.tasks(), { board: this.boardSelection(), tag: this.tagFilter() }),
  );

  ngOnInit(): void {
    void this.restore();
  }

  /** Loads the data and reopens the last board; a project that vanished falls back to "General". */
  private async restore(): Promise<void> {
    await Promise.all([this.store.load(), this.inbox.load()]);
    const current = this.boardSelection();
    const saved =
      current !== 'general' ? current : ((await this.api?.getBoardProject()) ?? 'general');
    const missing =
      typeof saved === 'object' && !this.store.projects().some((p) => p.id === saved.projectId);
    this.boardSelection.set(missing ? 'general' : saved);
    if (missing) void this.api?.setBoardProject('general');
    this.panelOpen.set((await this.api?.getBoardPanelOpen()) ?? true);
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

  protected togglePanel(): void {
    const open = !this.panelOpen();
    this.panelOpen.set(open);
    void this.api?.setBoardPanelOpen(open);
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

  protected chipClass(variant: 'neutral' | 'success'): string {
    return `${CHIP_BASE} ${CHIP_VARIANTS[variant].classes}`;
  }

  protected columnKey(status: TaskStatus): string {
    return COLUMN_KEYS[status];
  }

  protected count(id: ColumnId): number {
    return id === 'inbox' ? this.inbox.portalItems().length : this.board()[id].length;
  }

  protected repeatLabel(task: Task): string {
    return recurrenceLabel(this.transloco, task.recurrence);
  }

  /** "Completada hoy", "Completada ayer" or "Completada hace N días" for a task in "Hecho". */
  protected completedText(task: Task): string {
    if (task.completedAt === null) return '';
    const day = (iso: string) => new Date(`${iso}T00:00:00`).getTime();
    const days = Math.round(
      (day(localDate(new Date())) - day(localDate(new Date(task.completedAt)))) / DAY_MS,
    );
    if (days <= 0) return this.transloco.translate('ui.date.completedToday');
    if (days === 1) return this.transloco.translate('ui.date.completedYesterday');
    return this.transloco.translate('ui.date.completedDaysAgo', { days });
  }

  protected startAdd(status: TaskStatus): void {
    this.adding.set(status);
    this.addDraft.set('');
    this.addError.set(null);
    setTimeout(() =>
      this.host.nativeElement
        .querySelector<HTMLInputElement>('[data-testid="board-add-input"]')
        ?.focus(),
    );
  }

  /** Creates a task in the column, in the chosen project (none in "General" and "Sueltas"). */
  protected async submitAdd(status: TaskStatus): Promise<void> {
    const board = this.boardSelection();
    const tag = this.tagFilter();
    const failure = await this.store.create(
      {
        title: this.addDraft(),
        dueDate: null,
        projectId: typeof board === 'object' ? board.projectId : null,
        // With a tag filter on, the new card would vanish without its tag.
        tags: tag === null ? [] : [tag],
      },
      status,
    );
    if (failure) {
      this.addError.set(CARD_ERROR_KEYS[failure] ?? 'board.addFailed');
      return;
    }
    this.adding.set(null);
    this.addDraft.set('');
    this.addError.set(null);
  }

  /** Enter on a focused card opens its menu; Enter on something inside it keeps its own meaning. */
  protected openFromKey(task: Task, event: Event): void {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    this.openMenu(task, event.currentTarget as HTMLElement);
  }

  protected toggleMenu(task: Task, event: Event): void {
    if (this.menuFor() === task.id) {
      this.menuFor.set(null);
      return;
    }
    this.openMenu(task, (event.currentTarget as HTMLElement).closest<HTMLElement>('article')!);
  }

  /** Opens the "Mover a…" menu and focuses its first enabled option so the keyboard alone works. */
  private openMenu(task: Task, card: HTMLElement): void {
    this.menuFor.set(task.id);
    setTimeout(() => card.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus());
  }

  protected menuKey(event: KeyboardEvent): void {
    const down = event.key === 'ArrowDown';
    if (!down && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [
      ...(event.currentTarget as HTMLElement)
        .closest('[role="menu"]')!
        .querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'),
    ];
    const at = items.indexOf(event.target as HTMLElement);
    const next = down ? Math.min(at + 1, items.length - 1) : Math.max(at - 1, 0);
    items[next]?.focus();
  }

  /** Escape closes the open menu or "+" form; focus goes back to the card that had the menu. */
  @HostListener('keydown.escape')
  protected escape(): void {
    if (this.adding() !== null) {
      this.adding.set(null);
      this.addError.set(null);
    }
    const open = this.menuFor();
    if (open === null) return;
    this.menuFor.set(null);
    this.focusCard(open);
  }

  private focusCard(id: number): void {
    this.host.nativeElement.querySelector<HTMLElement>(`[data-task-id="${id}"]`)?.focus();
  }

  protected async move(task: Task, status: TaskStatus): Promise<void> {
    this.menuFor.set(null);
    await this.store.move(task, status);
    // The card was re-rendered in its new column: give focus back to it.
    setTimeout(() => this.focusCard(task.id));
  }

  protected drop(event: DragEvent, status: TaskStatus): void {
    event.preventDefault();
    const id = Number(event.dataTransfer?.getData('text/plain'));
    const task = this.store.tasks().find((t) => t.id === id);
    if (task && task.status !== status) void this.store.move(task, status);
  }

  /** Classifies a portal report as a task: it leaves "Entrantes" and lands in "Por hacer". */
  protected async classify(item: InboxItem): Promise<void> {
    this.inboxError.set(null);
    try {
      const failure = await this.inbox.convert(item.id, {
        title: item.title,
        dueDate: null,
        projectId: null,
        tags: [],
      });
      if (failure) {
        this.inboxError.set({
          id: item.id,
          key: CARD_ERROR_KEYS[failure] ?? 'inbox.classify.failed',
        });
        return;
      }
      await this.store.load();
    } catch {
      this.inboxError.set({ id: item.id, key: 'inbox.classify.failed' });
    }
  }

  protected async discard(item: InboxItem): Promise<void> {
    this.confirmingDiscard.set(null);
    try {
      await this.inbox.discard(item.id);
    } catch {
      this.inboxError.set({ id: item.id, key: 'inbox.classify.failed' });
    }
  }
}
