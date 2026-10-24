import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  BUG_SEVERITIES,
  DEFAULT_SEVERITY,
  type BugError,
  type BugSeverity,
} from '../../../../shared/bugs';
import type { InboxConvertError, InboxConvertType, InboxItem } from '../../../../shared/inbox';
import type { TaskError } from '../../../../shared/tasks';
import type { NoteError } from '../../../../shared/wiki';
import { BUG_ERROR_KEYS } from '../bugs/bugs-page';
import { RECURRENCE_ERROR_KEYS } from '../recurrence/recurrence-editor';
import { TAG_ERROR_KEYS, TagsEditor } from '../tags/tags-editor';
import { TasksStore } from '../tasks/tasks.store';
import { WikiStore } from '../wiki/wiki.store';
import { NOTE_ERROR_KEYS } from '../wiki/wiki-page';
import { InboxStore, type ConvertOutcome } from './inbox.store';
import { relativeTime } from './relative-time';

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
  type: InboxConvertType;
  title: string;
  symptom: string;
  impact: string;
  severity: BugSeverity;
  rootCause: string;
  solution: string;
  /** Wiki folder path for a note; '' is the root of the wiki. */
  section: string;
  dueDate: string;
  /** '' = loose, 'new' = create from `newProjectName`, otherwise a project id. */
  project: string;
  newProjectName: string;
  tags: string[];
}

interface Created {
  messageKey: string;
  linkKey: string;
  title: string;
  path: string;
  query?: Record<string, string>;
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
    @if (created(); as c) {
      <p
        class="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-accent bg-surface px-5 py-3 text-sm"
        role="status"
        data-testid="classify-created"
      >
        <span>{{ c.messageKey | transloco: { title: c.title } }}</span>
        <button
          type="button"
          class="rounded-md border border-line px-3 py-1 text-accent"
          data-testid="classify-created-link"
          (click)="openCreated(c)"
        >
          {{ c.linkKey | transloco }}
        </button>
      </p>
    }
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
        <div class="flex flex-wrap items-center gap-2 text-sm" role="group">
          <span class="text-muted">{{ 'inbox.classify.type' | transloco }}</span>
          @for (option of types; track option.type) {
            <button
              type="button"
              class="rounded-md border px-3 py-1"
              [class]="
                d.type === option.type ? 'border-accent text-accent' : 'border-line text-muted'
              "
              [attr.data-testid]="'type-' + option.type"
              [attr.aria-pressed]="d.type === option.type"
              (click)="patch({ type: option.type })"
            >
              {{ option.labelKey | transloco }}
            </button>
          }
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
        @switch (d.type) {
          @case ('task') {
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
          }
          @case ('bug') {
            <label class="block text-sm">
              <span class="text-muted">{{ 'bugs.fields.symptom' | transloco }}</span>
              <textarea
                rows="3"
                class="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-ink outline-none focus:border-accent"
                data-testid="classify-symptom"
                [value]="d.symptom"
                (input)="patch({ symptom: $any($event.target).value })"
              ></textarea>
            </label>
            <label class="block text-sm">
              <span class="text-muted">{{ 'bugs.fields.impact' | transloco }}</span>
              <textarea
                rows="2"
                class="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-ink outline-none focus:border-accent"
                data-testid="classify-impact"
                [value]="d.impact"
                (input)="patch({ impact: $any($event.target).value })"
              ></textarea>
            </label>
            <label class="block text-sm">
              <span class="text-muted">{{ 'bugs.fields.severity' | transloco }}</span>
              <select
                class="mt-1 block rounded-md border border-line bg-canvas px-3 py-2 text-ink"
                data-testid="classify-severity"
                [value]="d.severity"
                (change)="patch({ severity: $any($event.target).value })"
              >
                @for (level of severities; track level) {
                  <option [value]="level" [selected]="d.severity === level">
                    {{ 'bugs.severity.' + level | transloco }}
                  </option>
                }
              </select>
            </label>
            <label class="block text-sm">
              <span class="text-muted"
                >{{ 'bugs.fields.rootCause' | transloco }} ·
                {{ 'inbox.classify.optional' | transloco }}</span
              >
              <textarea
                rows="2"
                class="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-ink outline-none focus:border-accent"
                data-testid="classify-root-cause"
                [value]="d.rootCause"
                (input)="patch({ rootCause: $any($event.target).value })"
              ></textarea>
            </label>
            <label class="block text-sm">
              <span class="text-muted"
                >{{ 'bugs.fields.solution' | transloco }} ·
                {{ 'inbox.classify.optional' | transloco }}</span
              >
              <textarea
                rows="2"
                class="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-ink outline-none focus:border-accent"
                data-testid="classify-solution"
                [value]="d.solution"
                (input)="patch({ solution: $any($event.target).value })"
              ></textarea>
            </label>
          }
          @case ('note') {
            <label class="block text-sm">
              <span class="text-muted">{{ 'inbox.classify.section' | transloco }}</span>
              <select
                class="mt-1 block rounded-md border border-line bg-canvas px-3 py-2 text-ink"
                data-testid="classify-section"
                [value]="d.section"
                (change)="patch({ section: $any($event.target).value })"
              >
                <option value="" [selected]="d.section === ''">
                  {{ 'wiki.move.root' | transloco }}
                </option>
                @for (section of wiki.sections(); track section.name) {
                  <option [value]="section.name" [selected]="d.section === section.name">
                    {{ section.name }}
                  </option>
                }
              </select>
            </label>
          }
        }
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
  protected readonly wiki = inject(WikiStore);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  protected readonly types: { type: InboxConvertType; labelKey: string }[] = [
    { type: 'task', labelKey: 'inbox.classify.task' },
    { type: 'bug', labelKey: 'inbox.classify.bug' },
    { type: 'note', labelKey: 'inbox.classify.note' },
  ];
  protected readonly severities = BUG_SEVERITIES;
  /** Notice with a link to the bug or note the last conversion created (CP-01-22). */
  protected readonly created = signal<Created | null>(null);
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
    void this.wiki.load().catch(() => undefined);
  }

  protected time(iso: string): string {
    return relativeTime(iso);
  }

  select(item: InboxItem): void {
    this.selected.set(item);
    this.error.set(null);
    this.confirmingDiscard.set(false);
    this.draft.set({
      type: 'task',
      title: item.title,
      // A report from the portal keeps who sent it: it goes at the start of the symptom.
      symptom: item.reporter
        ? this.transloco.translate('inbox.classify.reportedBy', { name: item.reporter })
        : '',
      impact: '',
      severity: DEFAULT_SEVERITY,
      rootCause: '',
      solution: '',
      section: '',
      dueDate: '',
      project: '',
      newProjectName: '',
      tags: [],
    });
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
    if (d.type === 'task') return this.convertTask(d, item);
    let outcome: ConvertOutcome | null;
    try {
      outcome =
        d.type === 'bug'
          ? await this.store.convertToBug(item.id, {
              title: d.title,
              symptom: d.symptom,
              impact: d.impact,
              rootCause: d.rootCause,
              solution: d.solution,
              severity: d.severity,
            })
          : await this.store.convertToNote(item.id, {
              title: d.title,
              ...(d.section !== '' && { section: d.section }),
            });
    } catch {
      this.error.set('inbox.classify.failed');
      return;
    }
    if (outcome && !outcome.ok) {
      this.error.set(this.errorKey(d, outcome.error));
      return;
    }
    if (outcome) this.created.set(this.noticeFor(outcome.created));
    this.later();
  }

  private errorKey(d: Draft, error: InboxConvertError): string {
    if (d.type === 'bug') {
      // The title is checked first: an empty symptom or impact has its own message.
      if (error === 'empty' && d.title.trim() !== '') return 'inbox.classify.errors.bugRequired';
      return BUG_ERROR_KEYS[error as BugError] ?? 'inbox.classify.failed';
    }
    return NOTE_ERROR_KEYS[error as NoteError] ?? 'inbox.classify.failed';
  }

  private noticeFor(created: NonNullable<ConvertOutcome & { ok: true }>['created']): Created {
    if (created.type === 'bug') {
      return {
        messageKey: 'inbox.classify.createdBug',
        linkKey: 'inbox.classify.openBug',
        title: created.bug.title,
        path: 'bugs',
      };
    }
    return {
      messageKey: 'inbox.classify.createdNote',
      linkKey: 'inbox.classify.openNote',
      title: created.note.title,
      path: 'wiki',
      query: { note: created.note.slug },
    };
  }

  protected openCreated(c: Created): void {
    void this.router.navigate([c.path], c.query ? { queryParams: c.query } : {});
  }

  private async convertTask(d: Draft, item: InboxItem): Promise<void> {
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
      this.error.set(ERROR_KEYS[failure] ?? 'inbox.classify.failed');
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
