import {
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { isOverdue, localDate, type Task, type TaskError } from '../../../../shared/tasks';
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
import { RemindersToggle } from '../reminders/reminders-toggle';
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
  imports: [TranslocoPipe, TagsEditor, RecurrenceEditor, SeriesList, RemindersToggle],
  template: `
    <header class="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold">{{ 'nav.tasks' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted">{{ 'pages.tasks' | transloco }}</p>
        <app-reminders-toggle class="mt-2 block" />
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

    <div class="mb-4 flex gap-2 border-b border-line text-sm" role="tablist">
      @for (t of tabs; track t) {
        <button
          type="button"
          role="tab"
          class="-mb-px border-b-2 px-3 py-2"
          [attr.data-testid]="'tab-' + t"
          [attr.aria-selected]="tab() === t"
          [class]="tab() === t ? 'border-accent text-accent' : 'border-transparent text-muted'"
          (click)="tab.set(t)"
        >
          {{ 'tasks.tabs.' + t | transloco }}
        </button>
      }
    </div>

    @if (tab() === 'series') {
      <app-series-list (edit)="openForm($event)" />
    } @else {
      <label class="mb-3 flex items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          data-testid="show-completed"
          [checked]="store.showCompleted()"
          (change)="store.showCompleted.set($any($event.target).checked)"
        />
        {{ 'tasks.showCompleted' | transloco }}
      </label>

      @if (store.tags().length > 0) {
        <div class="mb-3 flex flex-wrap items-center gap-2 text-sm" data-testid="tag-filter">
          <span class="text-muted">{{ 'tasks.filterByTag' | transloco }}</span>
          <button
            type="button"
            class="rounded-full border px-2 py-0.5 text-xs"
            data-testid="tag-filter-all"
            [class]="store.tagFilter() === null ? 'border-accent text-accent' : 'border-line'"
            (click)="store.tagFilter.set(null)"
          >
            {{ 'tasks.allTags' | transloco }}
          </button>
          @for (tag of store.tags(); track tag) {
            <button
              type="button"
              class="rounded-full border px-2 py-0.5 text-xs"
              data-testid="tag-filter-option"
              [class]="store.tagFilter() === tag ? 'border-accent text-accent' : 'border-line'"
              [attr.aria-pressed]="store.tagFilter() === tag"
              (click)="store.tagFilter.set(store.tagFilter() === tag ? null : tag)"
            >
              #{{ tag }}
            </button>
          }
        </div>
      }

      @if (store.visible().length === 0) {
        <p class="rounded-lg border border-line bg-surface px-5 py-4 text-sm text-muted">
          {{ (store.tasks().length === 0 ? 'tasks.empty' : 'tasks.emptyPending') | transloco }}
        </p>
      } @else {
        <div class="rounded-lg border border-line bg-surface" data-testid="task-list">
          <div
            class="grid grid-cols-[1fr_10rem_9rem_auto] gap-4 border-b border-line px-5 py-2 text-[11px] font-semibold tracking-widest text-muted uppercase"
          >
            <span>{{ 'tasks.columns.task' | transloco }}</span>
            <span>{{ 'tasks.columns.project' | transloco }}</span>
            <span>{{ 'tasks.columns.due' | transloco }}</span>
            <span></span>
          </div>
          @for (task of store.visible(); track task.id) {
            <div
              class="grid grid-cols-[1fr_10rem_9rem_auto] items-center gap-4 border-b border-line px-5 py-3 last:border-b-0"
              data-testid="task-row"
              [attr.data-task-id]="task.id"
              [attr.data-highlighted]="task.id === highlightedId() ? 'true' : null"
              [class.bg-surface]="task.id === highlightedId()"
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
                    class="min-w-0 break-words"
                    [class.line-through]="task.status === 'done'"
                    [class.text-muted]="task.status === 'done'"
                    >{{ task.title }}</span
                  >
                  @if (task.reminderAt; as when) {
                    <span
                      class="rounded-full bg-line px-2 py-0.5 text-xs text-muted"
                      data-testid="task-reminder-chip"
                      >{{
                        (task.reminderNotifiedAt ? 'tasks.reminderDone' : 'tasks.reminderChip')
                          | transloco: { when: when.replace('T', ' ') }
                      }}</span
                    >
                  }
                  @if (chip(task); as text) {
                    <span
                      class="rounded-full bg-repeat/20 px-2 py-0.5 text-xs text-repeat"
                      data-testid="task-repeat-chip"
                      >{{ text }}</span
                    >
                  }
                </label>
                @if (task.tags.length > 0) {
                  <div class="mt-1 flex flex-wrap gap-1 pl-7">
                    @for (tag of task.tags; track tag) {
                      <span
                        class="rounded-full bg-line px-2 py-0.5 text-xs text-muted"
                        data-testid="task-tag"
                        >#{{ tag }}</span
                      >
                    }
                  </div>
                }
              </div>
              <span>
                <span
                  class="rounded-full px-2 py-0.5 text-xs"
                  data-testid="task-project-chip"
                  [class]="task.projectName ? 'bg-project/20 text-project' : 'bg-line text-muted'"
                  >{{ task.projectName ?? ('tasks.loose' | transloco) }}</span
                >
              </span>
              <span
                class="text-sm"
                data-testid="task-due-date"
                [class.text-warn]="overdue(task)"
                [class.text-muted]="!overdue(task)"
                >{{ task.dueDate ?? '' }}</span
              >
              <span class="flex items-center gap-2 text-sm">
                @if (confirming() === task.id) {
                  <span class="text-warn">{{ 'tasks.confirmDelete' | transloco }}</span>
                  <button
                    type="button"
                    class="rounded-md border border-warn px-2 py-1 text-warn"
                    data-testid="task-delete-confirm"
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
                  @if (task.status !== 'done') {
                    <button
                      type="button"
                      class="rounded-md border px-2 py-1"
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
                    class="rounded-md border border-line px-2 py-1"
                    data-testid="task-edit"
                    (click)="openForm(task)"
                  >
                    {{ 'tasks.edit' | transloco }}
                  </button>
                  <button
                    type="button"
                    class="rounded-md border border-line px-2 py-1"
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
  protected readonly tabs = ['tasks', 'series'] as const;
  protected readonly tab = signal<(typeof this.tabs)[number]>('tasks');
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
    if (task.status === 'done') this.store.showCompleted.set(true);
    setTimeout(() =>
      (this.host.nativeElement as HTMLElement)
        .querySelector(`[data-task-id="${task.id}"]`)
        ?.scrollIntoView?.({ block: 'center' }),
    );
  }

  protected chip(task: Task): string {
    return recurrenceLabel(this.transloco, task.recurrence);
  }

  protected overdue(task: Task): boolean {
    return isOverdue(task, localDate());
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
