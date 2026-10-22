import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { type Task, type TaskError } from '../../../../shared/tasks';
import {
  draftError,
  draftFromRule,
  EMPTY_RECURRENCE,
  RECURRENCE_ERROR_KEYS,
  RecurrenceEditor,
  ruleFromDraft,
  type RecurrenceDraft,
} from '../recurrence/recurrence-editor';
import { recurrenceLabel } from '../recurrence/recurrence-label';
import { SeriesList } from '../recurrence/series-list';
import { ProjectChip } from '../../shared/ui/project-chip';
import { RelativeDate } from '../../shared/ui/relative-date';
import { RepeatChip } from '../../shared/ui/repeat-chip';
import { SegmentedTabs, type TabItem } from '../../shared/ui/segmented-tabs';
import { RECURRENCE_KINDS, type RecurrenceKind } from '../../../../shared/recurrence';
import { TAG_ERROR_KEYS, TagsEditor } from '../tags/tags-editor';
import { TasksStore } from './tasks.store';

const ERROR_KEYS: Record<TaskError, string> = {
  empty: 'tasks.errors.empty',
  too_long: 'tasks.errors.tooLong',
  invalid_date: 'tasks.errors.invalidDate',
  invalid_project: 'tasks.errors.invalidProject',
  duplicate_project: 'board.errors.duplicate',
  not_found: 'tasks.errors.notFound',
  invalid_reminder: 'tasks.errors.invalidReminder',
  reminder_series: 'tasks.errors.reminderSeries',
  ...TAG_ERROR_KEYS,
  ...RECURRENCE_ERROR_KEYS,
};

const NEW_PROJECT = 'new';

interface Draft {
  title: string;
  dueDate: string;
  /** Local `YYYY-MM-DDTHH:mm`, or '' for no reminder. */
  reminderAt: string;
  /** '' = loose, 'new' = create from `newProjectName`, otherwise a project id. */
  project: string;
  newProjectName: string;
  tags: string[];
  recurrence: RecurrenceDraft;
}

const EMPTY_DRAFT: Draft = {
  title: '',
  dueDate: '',
  reminderAt: '',
  project: '',
  newProjectName: '',
  tags: [],
  recurrence: EMPTY_RECURRENCE,
};

/** Tasks list (RF-02): create, edit, complete and delete, with an optional project. */
@Component({
  selector: 'app-tasks-page',
  imports: [
    TranslocoPipe,
    TagsEditor,
    RecurrenceEditor,
    SeriesList,
    SegmentedTabs,
    ProjectChip,
    RepeatChip,
    RelativeDate,
  ],
  template: `
    <header class="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold">{{ 'nav.tasks' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted">{{ 'pages.tasks' | transloco }}</p>
      </div>
      <button
        type="button"
        class="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink"
        data-testid="new-task"
        (click)="openForm(null)"
      >
        {{ 'tasks.new' | transloco }}
      </button>
    </header>

    @if (draft(); as d) {
      <form
        class="mb-6 space-y-3 rounded-lg border border-line bg-surface-raised p-4"
        data-testid="task-form"
        (submit)="$event.preventDefault(); save()"
      >
        <label class="block text-sm">
          <span class="text-muted">{{ 'tasks.form.title' | transloco }}</span>
          <input
            type="text"
            class="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-ink outline-none focus:border-accent"
            data-testid="task-title"
            [placeholder]="'tasks.form.titlePlaceholder' | transloco"
            [value]="d.title"
            (input)="patch({ title: $any($event.target).value })"
          />
        </label>
        <div class="flex flex-wrap gap-3">
          <label class="block text-sm">
            <span class="text-muted">{{ 'tasks.form.due' | transloco }}</span>
            <input
              type="date"
              class="mt-1 block rounded-md border border-line bg-canvas px-3 py-2 text-ink"
              data-testid="task-due"
              [value]="d.dueDate"
              (input)="patch({ dueDate: $any($event.target).value })"
            />
          </label>
          <label class="block text-sm">
            <span class="text-muted">{{ 'tasks.form.reminder' | transloco }}</span>
            <span class="mt-1 flex items-center gap-2">
              <input
                type="datetime-local"
                class="block rounded-md border border-line bg-canvas px-3 py-2 text-ink"
                data-testid="task-reminder"
                [value]="d.reminderAt"
                (input)="patch({ reminderAt: $any($event.target).value })"
              />
              @if (d.reminderAt) {
                <button
                  type="button"
                  class="text-xs text-muted underline"
                  data-testid="task-reminder-clear"
                  (click)="patch({ reminderAt: '' })"
                >
                  {{ 'tasks.form.clearReminder' | transloco }}
                </button>
              }
            </span>
          </label>
          <label class="block text-sm">
            <span class="text-muted">{{ 'tasks.form.project' | transloco }}</span>
            <select
              class="mt-1 block rounded-md border border-line bg-canvas px-3 py-2 text-ink"
              data-testid="task-project"
              [value]="d.project"
              (change)="patch({ project: $any($event.target).value })"
            >
              <option value="">{{ 'tasks.form.noProject' | transloco }}</option>
              @for (project of store.projects(); track project.id) {
                <option [value]="project.id" [selected]="d.project === '' + project.id">
                  {{ project.name }}
                </option>
              }
              <option value="new" [selected]="d.project === 'new'">
                {{ 'tasks.form.newProject' | transloco }}
              </option>
            </select>
          </label>
          @if (d.project === newProject) {
            <label class="block text-sm">
              <span class="text-muted">{{ 'tasks.form.newProjectName' | transloco }}</span>
              <input
                type="text"
                class="mt-1 block rounded-md border border-line bg-canvas px-3 py-2 text-ink outline-none focus:border-accent"
                data-testid="task-new-project"
                [value]="d.newProjectName"
                (input)="patch({ newProjectName: $any($event.target).value })"
              />
            </label>
          }
        </div>
        <app-recurrence-editor
          [value]="d.recurrence"
          (valueChange)="patch({ recurrence: $event })"
        />
        <app-tags-editor
          [tags]="d.tags"
          (tagsChange)="patch({ tags: $event })"
          [known]="store.tags()"
        />
        @if (error(); as key) {
          <p class="text-sm text-warn" role="alert" data-testid="task-error">
            {{ key | transloco }}
          </p>
        }
        <div class="flex gap-2">
          <button
            type="submit"
            class="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink"
            data-testid="task-save"
          >
            {{ 'tasks.form.save' | transloco }}
          </button>
          <button
            type="button"
            class="rounded-md border border-line px-4 py-2 text-sm"
            (click)="closeForm()"
          >
            {{ 'tasks.form.cancel' | transloco }}
          </button>
        </div>
      </form>
    }

    <app-segmented-tabs
      class="mb-4 block"
      [tabs]="tabItems()"
      [selected]="tab()"
      (selectedChange)="selectTab($event)"
    />

    @if (tab() === 'series') {
      <app-series-list (edit)="openForm($event)" />
    } @else {
      <div class="mb-3 flex flex-wrap items-center gap-3 text-sm" data-testid="task-filters">
        <select
          class="rounded-md border border-line bg-canvas px-2 py-1 text-ink"
          data-testid="filter-project"
          [attr.aria-label]="'tasks.filters.project' | transloco"
          (change)="store.projectFilter.set(toProject($any($event.target).value))"
        >
          <option value="" [selected]="store.projectFilter() === null">
            {{ 'tasks.filters.allProjects' | transloco }}
          </option>
          <option value="loose" [selected]="store.projectFilter() === 'loose'">
            {{ 'tasks.filters.loose' | transloco }}
          </option>
          @for (project of store.projects(); track project.id) {
            <option [value]="project.id" [selected]="store.projectFilter() === project.id">
              {{ project.name }}
            </option>
          }
        </select>
        <select
          class="rounded-md border border-line bg-canvas px-2 py-1 text-ink"
          data-testid="filter-repeat"
          [attr.aria-label]="'tasks.filters.repeat' | transloco"
          (change)="store.kindFilter.set(toKind($any($event.target).value))"
        >
          <option value="" [selected]="store.kindFilter() === null">
            {{ 'tasks.filters.allRepeats' | transloco }}
          </option>
          @for (kind of kinds; track kind) {
            <option [value]="kind" [selected]="store.kindFilter() === kind">
              {{ 'recurrence.kinds.' + kind | transloco }}
            </option>
          }
        </select>
        @if (store.tags().length > 0) {
          <select
            class="rounded-md border border-line bg-canvas px-2 py-1 text-ink"
            data-testid="filter-tag"
            [attr.aria-label]="'tasks.filters.tag' | transloco"
            (change)="store.tagFilter.set($any($event.target).value || null)"
          >
            <option value="" [selected]="store.tagFilter() === null">
              {{ 'tasks.filters.allTags' | transloco }}
            </option>
            @for (tag of store.tags(); track tag) {
              <option [value]="tag" [selected]="store.tagFilter() === tag">#{{ tag }}</option>
            }
          </select>
        }
        <label class="flex items-center gap-2 text-muted">
          <input
            type="checkbox"
            data-testid="show-completed"
            [checked]="store.showCompleted()"
            (change)="store.showCompleted.set($any($event.target).checked)"
          />
          {{ 'tasks.showCompleted' | transloco }}
        </label>
        <span class="ml-auto text-muted" data-testid="task-count">{{
          'tasks.count.' + (store.visible().length === 1 ? 'one' : 'other')
            | transloco: { count: store.visible().length }
        }}</span>
      </div>

      @if (store.visible().length === 0) {
        <p
          class="rounded-lg border border-line bg-surface px-5 py-4 text-sm text-muted"
          data-testid="task-empty"
        >
          {{
            (store.tasks().length === 0
              ? 'tasks.empty'
              : filtering()
                ? 'tasks.emptyFiltered'
                : 'tasks.emptyPending'
            ) | transloco
          }}
        </p>
      } @else {
        <div class="rounded-lg border border-line bg-surface" data-testid="task-list">
          <div
            class="grid grid-cols-[1fr_9rem_11rem_8rem_12rem] gap-4 border-b border-line px-4 py-1.5 text-[11px] font-semibold tracking-widest text-muted uppercase"
          >
            <span>{{ 'tasks.columns.task' | transloco }}</span>
            <span>{{ 'tasks.columns.project' | transloco }}</span>
            <span>{{ 'tasks.columns.repeat' | transloco }}</span>
            <span>{{ 'tasks.columns.due' | transloco }}</span>
            <span></span>
          </div>
          @for (task of store.visible(); track task.id) {
            <div
              class="group grid grid-cols-[1fr_9rem_11rem_8rem_12rem] items-center gap-4 border-b border-line px-4 py-1.5 last:border-b-0 hover:bg-surface-raised"
              data-testid="task-row"
              [attr.data-task-id]="task.id"
              [attr.data-highlighted]="task.id === highlightedId() ? 'true' : null"
              [class.bg-surface-raised]="task.id === highlightedId()"
            >
              <div class="min-w-0">
                <label class="flex min-w-0 items-center gap-3">
                  <input
                    type="checkbox"
                    data-testid="task-check"
                    [checked]="task.status === 'done'"
                    [attr.aria-label]="'tasks.complete' | transloco"
                    (change)="store.setDone(task, $any($event.target).checked)"
                  />
                  <span
                    class="min-w-0 truncate"
                    data-testid="task-title-text"
                    [attr.title]="task.title"
                    [class.line-through]="task.status === 'done'"
                    [class.text-muted]="task.status === 'done'"
                    >{{ task.title }}</span
                  >
                  @if (task.reminderAt; as when) {
                    <span
                      class="shrink-0 rounded-full bg-line px-2 py-0.5 text-xs text-muted"
                      data-testid="task-reminder-chip"
                      >{{
                        (task.reminderNotifiedAt ? 'tasks.reminderDone' : 'tasks.reminderChip')
                          | transloco: { when: when.replace('T', ' ') }
                      }}</span
                    >
                  }
                </label>
                @if (task.tags.length > 0) {
                  <div class="flex flex-wrap gap-x-2 pl-7 text-[11px] text-muted">
                    @for (tag of task.tags; track tag) {
                      <span data-testid="task-tag">#{{ tag }}</span>
                    }
                  </div>
                }
              </div>
              <span class="min-w-0" data-testid="task-project-chip">
                <app-project-chip [name]="task.projectName" />
              </span>
              <span data-testid="task-repeat">
                @if (chip(task); as text) {
                  <app-repeat-chip data-testid="task-repeat-chip" [label]="text" />
                } @else {
                  <span class="text-sm text-muted">{{ 'recurrence.kinds.once' | transloco }}</span>
                }
              </span>
              <span class="text-sm" data-testid="task-due-date">
                @if (task.dueDate) {
                  <app-relative-date
                    [date]="task.dueDate"
                    [done]="task.status === 'done'"
                    [compact]="true"
                  />
                } @else {
                  <span class="text-muted">–</span>
                }
              </span>
              <span
                class="flex items-center justify-end gap-2 text-sm"
                [class]="
                  confirming() === task.id
                    ? ''
                    : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'
                "
                data-testid="task-actions"
              >
                @if (confirming() === task.id) {
                  <span class="text-warn">{{ 'tasks.confirmDelete' | transloco }}</span>
                  <button
                    type="button"
                    class="rounded-md border border-warn px-2 py-0.5 text-warn"
                    data-testid="task-delete-confirm"
                    (click)="remove(task)"
                  >
                    {{ 'tasks.confirmYes' | transloco }}
                  </button>
                  <button
                    type="button"
                    class="rounded-md border border-line px-2 py-0.5"
                    (click)="confirming.set(null)"
                  >
                    {{ 'tasks.confirmNo' | transloco }}
                  </button>
                } @else {
                  @if (task.status !== 'done') {
                    <button
                      type="button"
                      class="rounded-md border px-2 py-0.5"
                      data-testid="task-today"
                      [class]="task.forToday ? 'border-accent text-accent' : 'border-line'"
                      [attr.aria-pressed]="task.forToday"
                      (click)="store.setForToday(task, !task.forToday)"
                    >
                      {{ 'tasks.forToday' | transloco }}
                    </button>
                  }
                  <button
                    type="button"
                    class="rounded-md border border-line px-2 py-0.5"
                    data-testid="task-edit"
                    (click)="openForm(task)"
                  >
                    {{ 'tasks.edit' | transloco }}
                  </button>
                  <button
                    type="button"
                    class="rounded-md border border-line px-2 py-0.5"
                    data-testid="task-delete"
                    (click)="confirming.set(task.id)"
                  >
                    {{ 'tasks.delete' | transloco }}
                  </button>
                }
              </span>
            </div>
          }
        </div>
      }
    }
  `,
})
export class TasksPage implements OnInit {
  protected readonly store = inject(TasksStore);
  protected readonly newProject = NEW_PROJECT;
  protected readonly draft = signal<Draft | null>(null);
  protected readonly editing = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly confirming = signal<number | null>(null);
  private readonly transloco = inject(TranslocoService);
  protected readonly kinds: readonly RecurrenceKind[] = RECURRENCE_KINDS;
  protected readonly tab = signal<'tasks' | 'series'>('tasks');
  protected readonly tabItems = computed<TabItem[]>(() => [
    {
      id: 'tasks',
      label: this.transloco.translate('tasks.tabs.tasks'),
      count: this.store.pendingCount(),
    },
    {
      id: 'series',
      label: this.transloco.translate('tasks.tabs.series'),
      count: this.store.seriesCount(),
    },
  ]);
  /** True when a combo narrows the list, to tell "no matches" from "nothing pending". */
  protected readonly filtering = computed(
    () =>
      this.store.projectFilter() !== null ||
      this.store.kindFilter() !== null ||
      this.store.tagFilter() !== null,
  );
  private readonly tagsEditor = viewChild(TagsEditor);

  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  /** Task to point out, set when arriving from the global search (`?task=<id>`). */
  protected readonly highlightedId = signal<number | null>(null);

  ngOnInit(): void {
    const loaded = this.store.load();
    const sub = this.route?.queryParamMap.subscribe((params) => {
      const id = Number(params.get('task'));
      void loaded.then(() => this.reveal(Number.isInteger(id) && id > 0 ? id : null));
    });
    this.destroyRef.onDestroy(() => sub?.unsubscribe());
  }

  /** Makes sure filters do not hide the task, then scrolls to it. */
  private reveal(id: number | null): void {
    this.highlightedId.set(id);
    const task = id === null ? undefined : this.store.tasks().find((t) => t.id === id);
    if (!task) return;
    this.tab.set('tasks');
    this.store.tagFilter.set(null);
    this.store.projectFilter.set(null);
    this.store.kindFilter.set(null);
    if (task.status === 'done') this.store.showCompleted.set(true);
    setTimeout(() =>
      (this.host.nativeElement as HTMLElement)
        .querySelector(`[data-task-id="${task.id}"]`)
        ?.scrollIntoView?.({ block: 'center' }),
    );
  }

  protected selectTab(id: string): void {
    this.tab.set(id === 'series' ? 'series' : 'tasks');
  }

  protected toProject(value: string): number | 'loose' | null {
    return value === '' ? null : value === 'loose' ? 'loose' : Number(value);
  }

  protected toKind(value: string): RecurrenceKind | null {
    return (RECURRENCE_KINDS as readonly string[]).includes(value)
      ? (value as RecurrenceKind)
      : null;
  }

  protected chip(task: Task): string {
    return recurrenceLabel(this.transloco, task.recurrence);
  }

  openForm(task: Task | null): void {
    this.editing.set(task?.id ?? null);
    this.error.set(null);
    this.draft.set(
      task
        ? {
            title: task.title,
            dueDate: task.dueDate ?? '',
            reminderAt: task.reminderAt ?? '',
            project: task.projectId === null ? '' : String(task.projectId),
            newProjectName: '',
            tags: task.tags,
            recurrence: draftFromRule(task.recurrence),
          }
        : { ...EMPTY_DRAFT },
    );
  }

  closeForm(): void {
    this.draft.set(null);
    this.editing.set(null);
    this.error.set(null);
  }

  protected patch(change: Partial<Draft>): void {
    this.draft.update((d) => (d ? { ...d, ...change } : d));
    this.error.set(null);
  }

  async save(): Promise<void> {
    const d = this.draft();
    if (!d) return;
    const creating = d.project === NEW_PROJECT;
    if (creating && d.newProjectName.trim() === '') {
      this.error.set(ERROR_KEYS.invalid_project);
      return;
    }
    const repeatError = draftError(d.recurrence);
    if (repeatError) {
      this.error.set(RECURRENCE_ERROR_KEYS[repeatError]);
      return;
    }
    const pendingTag = this.tagsEditor()?.flush();
    if (pendingTag) {
      this.error.set(pendingTag);
      return;
    }
    let failure: TaskError | null;
    try {
      failure = await this.store.save(
        {
          title: d.title,
          dueDate: d.dueDate || null,
          reminderAt: d.reminderAt || null,
          projectId: d.project === '' || creating ? null : Number(d.project),
          newProjectName: creating ? d.newProjectName : null,
          tags: this.draft()!.tags,
          recurrence: ruleFromDraft(d.recurrence),
        },
        this.editing(),
      );
    } catch {
      this.error.set('tasks.errors.failed');
      return;
    }
    if (failure) {
      this.error.set(ERROR_KEYS[failure]);
      return;
    }
    this.closeForm();
  }

  async remove(task: Task): Promise<void> {
    await this.store.remove(task);
    this.confirming.set(null);
  }
}
