import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  filterTopics,
  isTopicStatus,
  TOPIC_STATUSES,
  type TopicError,
  type TopicInput,
  type TopicStatusFilter,
} from '../../../../shared/learning';
import { LearningStore } from './learning.store';

export const TOPIC_ERROR_KEYS: Record<TopicError, string> = {
  empty_title: 'learning.errors.emptyTitle',
  too_long: 'learning.errors.tooLong',
  invalid: 'learning.errors.invalid',
  invalid_status: 'learning.errors.invalid',
  not_found: 'learning.errors.notFound',
};

const FILTERS: TopicStatusFilter[] = ['all', ...TOPIC_STATUSES];

const emptyDraft = (): TopicInput => ({ title: '', notes: '' });

/** Aprendizaje (RF-14): a simple list of topics with a status filter and an inline form. */
@Component({
  selector: 'app-learning-page',
  imports: [TranslocoPipe],
  template: `
    <header class="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold">{{ 'nav.learning' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted">{{ 'pages.learning' | transloco }}</p>
      </div>
      <button
        type="button"
        class="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink"
        data-testid="new-topic"
        (click)="startNew()"
      >
        {{ 'learning.new' | transloco }}
      </button>
    </header>

    @if (draft(); as d) {
      <form
        class="mb-6 space-y-3 rounded-lg border border-line bg-surface p-4 text-sm"
        data-testid="topic-form"
        (submit)="$event.preventDefault(); save()"
      >
        <label class="block">
          <span class="text-muted">{{ 'learning.fields.title' | transloco }}</span>
          <input
            type="text"
            class="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-ink outline-none focus:border-accent"
            data-testid="topic-title"
            [value]="d.title"
            (input)="patch({ title: $any($event.target).value })"
          />
        </label>
        <label class="block">
          <span class="text-muted">{{ 'learning.fields.notes' | transloco }}</span>
          <textarea
            class="mt-1 h-28 w-full rounded-md border border-line bg-canvas px-3 py-2 text-ink outline-none focus:border-accent"
            data-testid="topic-notes"
            [value]="d.notes ?? ''"
            (input)="patch({ notes: $any($event.target).value })"
          ></textarea>
        </label>
        @if (error(); as key) {
          <p class="text-warn" role="alert" data-testid="topic-error">{{ key | transloco }}</p>
        }
        <div class="flex gap-2">
          <button
            type="submit"
            class="rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink"
            data-testid="topic-save"
          >
            {{ 'learning.save' | transloco }}
          </button>
          <button
            type="button"
            class="rounded-md border border-line px-3 py-2"
            data-testid="topic-cancel"
            (click)="stopEditing()"
          >
            {{ 'learning.cancel' | transloco }}
          </button>
        </div>
      </form>
    }

    @if (store.topics().length === 0) {
      @if (!draft()) {
        <div
          class="rounded-lg border border-line bg-surface px-5 py-6 text-sm text-muted"
          data-testid="topics-empty"
        >
          <p class="mb-3">{{ 'learning.empty' | transloco }}</p>
          <button
            type="button"
            class="rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink"
            data-testid="empty-new-topic"
            (click)="startNew()"
          >
            {{ 'learning.createFirst' | transloco }}
          </button>
        </div>
      }
    } @else {
      <div class="mb-3 flex gap-2 text-sm" role="tablist">
        @for (f of filters; track f) {
          <button
            type="button"
            role="tab"
            class="rounded-md border px-3 py-1"
            [class]="filter() === f ? 'border-accent text-accent' : 'border-line'"
            [attr.aria-selected]="filter() === f"
            [attr.data-testid]="'filter-' + f"
            (click)="filter.set(f)"
          >
            {{ 'learning.filters.' + f | transloco }}
          </button>
        }
      </div>

      @if (visible().length === 0) {
        <p
          class="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted"
          data-testid="topics-empty-filter"
        >
          {{ 'learning.emptyFilter' | transloco }}
        </p>
      } @else {
        <ul class="space-y-3" data-testid="topic-list">
          @for (t of visible(); track t.id) {
            <li
              class="rounded-lg border border-line bg-surface p-4 text-sm"
              data-testid="topic-card"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <h2 class="truncate font-semibold" data-testid="topic-card-title">
                    {{ t.title }}
                  </h2>
                  <span
                    class="mt-1 inline-block rounded-full border border-line px-2 text-xs text-muted"
                    data-testid="topic-status-chip"
                    >{{ 'learning.status.' + t.status | transloco }}</span
                  >
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <label class="flex items-center gap-2">
                    <span class="text-muted">{{ 'learning.statusLabel' | transloco }}</span>
                    <select
                      class="rounded-md border border-line bg-canvas px-2 py-1 text-ink"
                      data-testid="topic-status"
                      (change)="setStatus(t.id, $any($event.target).value)"
                    >
                      @for (s of statuses; track s) {
                        <option [value]="s" [selected]="t.status === s">
                          {{ 'learning.status.' + s | transloco }}
                        </option>
                      }
                    </select>
                  </label>
                  <button
                    type="button"
                    class="rounded-md border border-line px-3 py-1"
                    data-testid="topic-edit"
                    (click)="startEdit(t.id)"
                  >
                    {{ 'learning.edit' | transloco }}
                  </button>
                  @if (confirmingId() === t.id) {
                    <button
                      type="button"
                      class="rounded-md border border-warn px-3 py-1 text-warn"
                      data-testid="topic-delete-confirm"
                      (click)="remove(t.id)"
                    >
                      {{ 'learning.confirmYes' | transloco }}
                    </button>
                    <button
                      type="button"
                      class="rounded-md border border-line px-3 py-1"
                      data-testid="topic-delete-cancel"
                      (click)="confirmingId.set(null)"
                    >
                      {{ 'learning.confirmNo' | transloco }}
                    </button>
                  } @else {
                    <button
                      type="button"
                      class="rounded-md border border-line px-3 py-1"
                      data-testid="topic-delete"
                      (click)="confirmingId.set(t.id)"
                    >
                      {{ 'learning.delete' | transloco }}
                    </button>
                  }
                </div>
              </div>
              @if (t.notes) {
                <p class="mt-3 whitespace-pre-wrap text-muted" data-testid="topic-card-notes">
                  {{ t.notes }}
                </p>
              }
            </li>
          }
        </ul>
      }
    }
  `,
})
export class LearningPage implements OnInit {
  protected readonly store = inject(LearningStore);
  protected readonly statuses = TOPIC_STATUSES;
  protected readonly filters = FILTERS;
  protected readonly filter = signal<TopicStatusFilter>('all');
  protected readonly draft = signal<TopicInput | null>(null);
  protected readonly editingId = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmingId = signal<number | null>(null);

  protected readonly visible = computed(() => filterTopics(this.store.topics(), this.filter()));

  ngOnInit(): void {
    void this.store.load();
  }

  protected startNew(): void {
    this.editingId.set(null);
    this.begin(emptyDraft());
  }

  protected startEdit(id: number): void {
    const topic = this.store.topics().find((t) => t.id === id);
    if (!topic) return;
    this.editingId.set(id);
    this.begin({ title: topic.title, notes: topic.notes });
  }

  private begin(draft: TopicInput): void {
    this.confirmingId.set(null);
    this.error.set(null);
    this.draft.set(draft);
  }

  protected stopEditing(): void {
    this.draft.set(null);
    this.editingId.set(null);
    this.error.set(null);
  }

  protected patch(change: Partial<TopicInput>): void {
    this.draft.update((d) => (d ? { ...d, ...change } : d));
    this.error.set(null);
  }

  protected async save(): Promise<void> {
    const d = this.draft();
    if (!d) return;
    const id = this.editingId();
    let failure: TopicError | null;
    try {
      failure = id === null ? await this.store.create(d) : await this.store.update(id, d);
    } catch {
      this.error.set(TOPIC_ERROR_KEYS.invalid);
      return;
    }
    if (failure) {
      this.error.set(TOPIC_ERROR_KEYS[failure]);
      return;
    }
    // Make sure the saved topic is not hidden by the current filter.
    this.filter.set('all');
    this.stopEditing();
  }

  protected async setStatus(id: number, value: unknown): Promise<void> {
    if (!isTopicStatus(value)) return;
    await this.store.setStatus(id, value);
  }

  protected async remove(id: number): Promise<void> {
    await this.store.remove(id);
    this.confirmingId.set(null);
    if (this.editingId() === id) this.stopEditing();
  }
}
