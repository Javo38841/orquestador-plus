import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { InboxItem } from '../../../../shared/inbox';
import type { TaskError } from '../../../../shared/tasks';
import { RECURRENCE_ERROR_KEYS } from '../recurrence/recurrence-editor';
import { TAG_ERROR_KEYS, TagsEditor } from '../tags/tags-editor';
import { TasksStore } from '../tasks/tasks.store';
import { InboxStore } from './inbox.store';
import { relativeTime } from './relative-time';

const ERROR_KEYS: Record<TaskError, string> = {
  empty: 'tasks.errors.empty',
  too_long: 'tasks.errors.tooLong',
  invalid_date: 'tasks.errors.invalidDate',
  invalid_project: 'tasks.errors.invalidProject',
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
  /** '' = loose, 'new' = create from `newProjectName`, otherwise a project id. */
  project: string;
  newProjectName: string;
  tags: string[];
}

/** Inbox (RF-01): list of captured items and the "Clasificar" panel (convert or discard). */
@Component({
  selector: 'app-inbox-page',
  imports: [TranslocoPipe, TagsEditor],
  template: `
    <header class="mb-8">
      <h1 class="text-2xl font-semibold">{{ 'nav.inbox' | transloco }}</h1>
      <p class="mt-1 text-sm text-muted">{{ 'pages.inbox' | transloco }}</p>
    </header>
    @if (store.items().length === 0) {
      <p class="rounded-lg border border-line bg-surface px-5 py-4 text-sm text-muted">
        {{ 'inbox.empty' | transloco }}
      </p>
    } @else {
      <ul class="space-y-2" data-testid="inbox-list">
        @for (item of store.items(); track item.id) {
          <li data-testid="inbox-row">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-4 rounded-lg border bg-surface px-5 py-3 text-left"
              [class]="selectedId() === item.id ? 'border-accent' : 'border-line'"
              data-testid="inbox-item"
              [attr.aria-pressed]="selectedId() === item.id"
              (click)="select(item)"
            >
              <span class="min-w-0 break-words">{{ item.title }}</span>
              <span class="shrink-0 text-xs text-muted">
                {{ 'inbox.source.' + item.source | transloco }}
                @if (item.reporter) {
                  <span data-testid="inbox-reporter"> · {{ item.reporter }}</span>
                }
                · {{ time(item.createdAt) }}
              </span>
            </button>
          </li>
        }
      </ul>
    }
    @if (draft(); as d) {
      <form
        class="mt-6 space-y-3 rounded-lg border border-line bg-surface-raised p-4"
        data-testid="classify-panel"
        (submit)="$event.preventDefault(); convert()"
      >
        <h2 class="text-lg font-semibold">{{ 'inbox.classify.title' | transloco }}</h2>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="text-muted">{{ 'inbox.classify.type' | transloco }}</span>
          <button
            type="button"
            class="rounded-md border border-accent px-3 py-1 text-accent"
            data-testid="type-task"
            aria-pressed="true"
          >
            {{ 'inbox.classify.task' | transloco }}
          </button>
          <button
            type="button"
            class="rounded-md border border-line px-3 py-1 text-muted opacity-60"
            data-testid="type-bug"
            disabled
            [title]="'inbox.classify.soon' | transloco"
          >
            {{ 'inbox.classify.bug' | transloco }} · {{ 'inbox.classify.soon' | transloco }}
          </button>
          <button
            type="button"
            class="rounded-md border border-line px-3 py-1 text-muted opacity-60"
            data-testid="type-note"
            disabled
            [title]="'inbox.classify.soon' | transloco"
          >
            {{ 'inbox.classify.note' | transloco }} · {{ 'inbox.classify.soon' | transloco }}
          </button>
        </div>
        <label class="block text-sm">
          <span class="text-muted">{{ 'inbox.classify.itemTitle' | transloco }}</span>
          <input
            type="text"
            class="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-ink outline-none focus:border-accent"
            data-testid="classify-title"
            [value]="d.title"
            (input)="patch({ title: $any($event.target).value })"
          />
        </label>
        <div class="flex flex-wrap gap-3">
          <label class="block text-sm">
            <span class="text-muted">{{ 'inbox.classify.due' | transloco }}</span>
            <input
              type="date"
              class="mt-1 block rounded-md border border-line bg-canvas px-3 py-2 text-ink"
              data-testid="classify-due"
              [value]="d.dueDate"
              (input)="patch({ dueDate: $any($event.target).value })"
            />
          </label>
          <label class="block text-sm">
            <span class="text-muted">{{ 'inbox.classify.project' | transloco }}</span>
            <select
              class="mt-1 block rounded-md border border-line bg-canvas px-3 py-2 text-ink"
              data-testid="classify-project"
              [value]="d.project"
              (change)="patch({ project: $any($event.target).value })"
            >
              <option value="">{{ 'inbox.classify.noProject' | transloco }}</option>
              @for (project of tasks.projects(); track project.id) {
                <option [value]="project.id" [selected]="d.project === '' + project.id">
                  {{ project.name }}
                </option>
              }
              <option value="new" [selected]="d.project === 'new'">
                {{ 'inbox.classify.newProject' | transloco }}
              </option>
            </select>
          </label>
          @if (d.project === newProject) {
            <label class="block text-sm">
              <span class="text-muted">{{ 'inbox.classify.newProjectName' | transloco }}</span>
              <input
                type="text"
                class="mt-1 block rounded-md border border-line bg-canvas px-3 py-2 text-ink outline-none focus:border-accent"
                data-testid="classify-new-project"
                [value]="d.newProjectName"
                (input)="patch({ newProjectName: $any($event.target).value })"
              />
            </label>
          }
        </div>
        <app-tags-editor
          [tags]="d.tags"
          (tagsChange)="patch({ tags: $event })"
          [known]="tasks.tags()"
        />
        @if (error(); as key) {
          <p class="text-sm text-warn" role="alert" data-testid="classify-error">
            {{ key | transloco }}
          </p>
        }
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="submit"
            class="rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink"
            data-testid="classify-convert"
          >
            {{ 'inbox.classify.convert' | transloco }}
          </button>
          @if (confirmingDiscard()) {
            <span class="text-warn">{{ 'inbox.classify.confirmDiscard' | transloco }}</span>
            <button
              type="button"
              class="rounded-md border border-warn px-3 py-2 text-warn"
              data-testid="classify-discard-confirm"
              (click)="discard()"
            >
              {{ 'inbox.classify.confirmYes' | transloco }}
            </button>
            <button
              type="button"
              class="rounded-md border border-line px-3 py-2"
              (click)="confirmingDiscard.set(false)"
            >
              {{ 'inbox.classify.confirmNo' | transloco }}
            </button>
          } @else {
            <button
              type="button"
              class="rounded-md border border-line px-3 py-2"
              data-testid="classify-discard"
              (click)="confirmingDiscard.set(true)"
            >
              {{ 'inbox.classify.discard' | transloco }}
            </button>
            <button
              type="button"
              class="rounded-md border border-line px-3 py-2"
              data-testid="classify-later"
              (click)="later()"
            >
              {{ 'inbox.classify.later' | transloco }}
            </button>
          }
        </div>
      </form>
    }
  `,
})
export class InboxPage implements OnInit {
  protected readonly store = inject(InboxStore);
  protected readonly tasks = inject(TasksStore);
  protected readonly newProject = NEW_PROJECT;
  protected readonly draft = signal<Draft | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmingDiscard = signal(false);
  private readonly tagsEditor = viewChild(TagsEditor);
  private readonly selected = signal<InboxItem | null>(null);
  protected readonly selectedId = computed(() => this.selected()?.id ?? null);

  ngOnInit(): void {
    void this.store.load();
    void this.tasks.load();
  }

  protected time(iso: string): string {
    return relativeTime(iso);
  }

  select(item: InboxItem): void {
    this.selected.set(item);
    this.error.set(null);
    this.confirmingDiscard.set(false);
    this.draft.set({ title: item.title, dueDate: '', project: '', newProjectName: '', tags: [] });
  }

  /** "Dejar para después": closes the panel and leaves the item untouched. */
  later(): void {
    this.selected.set(null);
    this.draft.set(null);
    this.error.set(null);
    this.confirmingDiscard.set(false);
  }

  protected patch(change: Partial<Draft>): void {
    this.draft.update((d) => (d ? { ...d, ...change } : d));
    this.error.set(null);
  }

  async convert(): Promise<void> {
    const d = this.draft();
    const item = this.selected();
    if (!d || !item) return;
    const creating = d.project === NEW_PROJECT;
    if (creating && d.newProjectName.trim() === '') {
      this.error.set(ERROR_KEYS.invalid_project);
      return;
    }
    const pendingTag = this.tagsEditor()?.flush();
    if (pendingTag) {
      this.error.set(pendingTag);
      return;
    }
    let failure: TaskError | null;
    try {
      failure = await this.store.convert(item.id, {
        title: d.title,
        dueDate: d.dueDate || null,
        projectId: d.project === '' || creating ? null : Number(d.project),
        newProjectName: creating ? d.newProjectName : null,
        tags: this.draft()!.tags,
      });
    } catch {
      this.error.set('inbox.classify.failed');
      return;
    }
    if (failure) {
      this.error.set(ERROR_KEYS[failure]);
      return;
    }
    this.later();
    void this.tasks.load();
  }

  async discard(): Promise<void> {
    const item = this.selected();
    if (!item) return;
    try {
      await this.store.discard(item.id);
    } catch {
      this.error.set('inbox.classify.failed');
      return;
    }
    this.later();
  }
}
