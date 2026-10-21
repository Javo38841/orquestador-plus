import { Component, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { isOverdue, localDate, type Task, type TaskError } from '../../../../shared/tasks';
import { TasksStore } from './tasks.store';

const ERROR_KEYS: Record<TaskError, string> = {
  empty: 'tasks.errors.empty',
  too_long: 'tasks.errors.tooLong',
  invalid_date: 'tasks.errors.invalidDate',
  invalid_project: 'tasks.errors.invalidProject',
  not_found: 'tasks.errors.notFound',
};

const NEW_PROJECT = 'new';

interface Draft {
  title: string;
  dueDate: string;
  /** '' = loose, 'new' = create from `newProjectName`, otherwise a project id. */
  project: string;
  newProjectName: string;
}

const EMPTY_DRAFT: Draft = { title: '', dueDate: '', project: '', newProjectName: '' };

/** Tasks list (RF-02): create, edit, complete and delete, with an optional project. */
@Component({
  selector: 'app-tasks-page',
  imports: [TranslocoPipe],
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

    <label class="mb-3 flex items-center gap-2 text-sm text-muted">
      <input
        type="checkbox"
        data-testid="show-completed"
        [checked]="store.showCompleted()"
        (change)="store.showCompleted.set($any($event.target).checked)"
      />
      {{ 'tasks.showCompleted' | transloco }}
    </label>

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
          >
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
            </label>
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
  `,
})
export class TasksPage implements OnInit {
  protected readonly store = inject(TasksStore);
  protected readonly newProject = NEW_PROJECT;
  protected readonly draft = signal<Draft | null>(null);
  protected readonly editing = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly confirming = signal<number | null>(null);

  ngOnInit(): void {
    void this.store.load();
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
            project: task.projectId === null ? '' : String(task.projectId),
            newProjectName: '',
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
    let failure: TaskError | null;
    try {
      failure = await this.store.save(
        {
          title: d.title,
          dueDate: d.dueDate || null,
          projectId: d.project === '' || creating ? null : Number(d.project),
          newProjectName: creating ? d.newProjectName : null,
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
