import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  filterSnippets,
  SNIPPETS_VIEWS,
  SNIPPET_TYPES,
  type SnippetError,
  type SnippetInput,
  type SnippetType,
  type SnippetTypeFilter,
} from '../../../../shared/snippets';
import { SnippetTypeBadge } from '../../shared/ui/snippet-type-badge';
import { TagChip } from '../../shared/ui/tag-chip';
import { TagsEditor } from '../tags/tags-editor';
import { SnippetsStore } from './snippets.store';

export const SNIPPET_ERROR_KEYS: Record<SnippetError, string> = {
  empty_title: 'snippets.errors.emptyTitle',
  empty_content: 'snippets.errors.emptyContent',
  too_long: 'snippets.errors.tooLong',
  invalid: 'snippets.errors.invalid',
  invalid_tags: 'snippets.errors.invalid',
  tag_empty: 'tags.errors.empty',
  tag_too_long: 'tags.errors.tooLong',
  tag_spaces: 'tags.errors.spaces',
  not_found: 'snippets.errors.notFound',
};

const TYPE_FILTERS: SnippetTypeFilter[] = ['all', ...SNIPPET_TYPES];

/** How long the "Copiado" confirmation stays on a card. */
export const COPIED_FEEDBACK_MS = 1500;

const emptyDraft = (): SnippetInput => ({ title: '', type: 'sql', content: '', tags: [] });

/** Snippets y comandos (RF-13): cards with a copy button, filters and a create/edit form. */
@Component({
  selector: 'app-snippets-page',
  imports: [TranslocoPipe, TagsEditor, SnippetTypeBadge, TagChip],
  template: `
    <header class="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold">{{ 'nav.snippets' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted">{{ 'pages.snippets' | transloco }}</p>
      </div>
      <button
        type="button"
        class="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink"
        data-testid="new-snippet"
        (click)="startNew()"
      >
        {{ 'snippets.new' | transloco }}
      </button>
    </header>

    @if (draft(); as d) {
      <form
        class="mb-6 space-y-3 rounded-lg border border-line bg-surface p-4 text-sm"
        data-testid="snippet-form"
        (submit)="$event.preventDefault(); save()"
      >
        <label class="block">
          <span class="text-muted">{{ 'snippets.fields.title' | transloco }}</span>
          <input
            type="text"
            class="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-ink outline-none focus:border-accent"
            data-testid="snippet-title"
            [value]="d.title"
            (input)="patch({ title: $any($event.target).value })"
          />
        </label>
        <label class="block">
          <span class="text-muted">{{ 'snippets.fields.type' | transloco }}</span>
          <select
            class="mt-1 block rounded-md border border-line bg-canvas px-3 py-2 text-ink"
            data-testid="snippet-type"
            (change)="patch({ type: $any($event.target).value })"
          >
            @for (t of types; track t) {
              <option [value]="t" [selected]="d.type === t">
                {{ 'snippets.types.' + t | transloco }}
              </option>
            }
          </select>
        </label>
        <label class="block">
          <span class="text-muted">{{ 'snippets.fields.content' | transloco }}</span>
          <textarea
            class="mt-1 h-40 w-full rounded-md border border-line bg-canvas px-3 py-2 font-mono text-ink outline-none focus:border-accent"
            data-testid="snippet-content"
            spellcheck="false"
            [value]="d.content"
            (input)="patch({ content: $any($event.target).value })"
          ></textarea>
        </label>
        <app-tags-editor
          [tags]="d.tags ?? []"
          [known]="store.tags()"
          (tagsChange)="patch({ tags: $event })"
        />
        @if (error(); as key) {
          <p class="text-warn" role="alert" data-testid="snippet-error">{{ key | transloco }}</p>
        }
        <div class="flex gap-2">
          <button
            type="submit"
            class="rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink"
            data-testid="snippet-save"
          >
            {{ 'snippets.save' | transloco }}
          </button>
          <button
            type="button"
            class="rounded-md border border-line px-3 py-2"
            data-testid="snippet-cancel"
            (click)="stopEditing()"
          >
            {{ 'snippets.cancel' | transloco }}
          </button>
        </div>
      </form>
    }

    @if (store.snippets().length === 0) {
      @if (!draft()) {
        <div
          class="rounded-lg border border-line bg-surface px-5 py-6 text-sm text-muted"
          data-testid="snippets-empty"
        >
          <p class="mb-3">{{ 'snippets.empty' | transloco }}</p>
          <button
            type="button"
            class="rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink"
            data-testid="empty-new-snippet"
            (click)="startNew()"
          >
            {{ 'snippets.createFirst' | transloco }}
          </button>
        </div>
      }
    } @else {
      <div class="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <input
          type="search"
          class="min-w-64 flex-1 rounded-md border border-line bg-canvas px-3 py-1.5 text-ink outline-none focus:border-accent"
          data-testid="snippet-search"
          [placeholder]="'snippets.searchPlaceholder' | transloco"
          [attr.aria-label]="'snippets.searchPlaceholder' | transloco"
          [value]="search()"
          (input)="search.set($any($event.target).value)"
        />
        <div class="flex gap-2" role="tablist">
          @for (f of typeFilters; track f) {
            <button
              type="button"
              role="tab"
              class="rounded-md border px-3 py-1"
              [class]="typeFilter() === f ? 'border-accent text-accent' : 'border-line'"
              [attr.aria-selected]="typeFilter() === f"
              [attr.data-testid]="'filter-' + f"
              (click)="typeFilter.set(f)"
            >
              {{ 'snippets.filters.' + f | transloco }} · {{ store.counts()[f] }}
            </button>
          }
        </div>
        @if (store.tags().length > 0) {
          <label class="flex items-center gap-2">
            <span class="text-muted">{{ 'snippets.filterTag' | transloco }}</span>
            <select
              class="rounded-md border border-line bg-canvas px-2 py-1 text-ink"
              data-testid="filter-tag"
              (change)="tagFilter.set($any($event.target).value || null)"
            >
              <option value="" [selected]="tagFilter() === null">
                {{ 'snippets.allTags' | transloco }}
              </option>
              @for (t of store.tags(); track t) {
                <option [value]="t" [selected]="tagFilter() === t">#{{ t }}</option>
              }
            </select>
          </label>
        }
        <div
          class="ml-auto flex gap-1"
          role="group"
          [attr.aria-label]="'snippets.view.label' | transloco"
        >
          @for (v of views; track v) {
            <button
              type="button"
              class="rounded-md border px-3 py-1"
              [class]="store.view() === v ? 'border-accent text-accent' : 'border-line text-muted'"
              [attr.aria-pressed]="store.view() === v"
              [attr.data-testid]="'view-' + v"
              (click)="store.setView(v)"
            >
              {{ 'snippets.view.' + v | transloco }}
            </button>
          }
        </div>
      </div>

      @if (visible().length === 0) {
        <p class="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
          {{ 'snippets.emptyFilter' | transloco }}
        </p>
      } @else {
        <ul
          [class]="store.view() === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-2'"
          [attr.data-view]="store.view()"
          data-testid="snippet-list"
        >
          @for (s of visible(); track s.id) {
            <li
              class="flex min-w-0 flex-col rounded-lg border border-line bg-surface text-sm"
              [class]="store.view() === 'grid' ? 'p-4' : 'px-3 py-2'"
              data-testid="snippet-card"
            >
              <div class="flex items-center justify-between gap-3">
                <h2 class="min-w-0 truncate font-semibold" data-testid="snippet-card-title">
                  {{ s.title }}
                </h2>
                <app-snippet-type-badge [type]="s.type" />
              </div>
              <pre
                class="overflow-auto rounded-md bg-canvas p-2 font-mono text-xs"
                [class]="store.view() === 'grid' ? 'mt-3 max-h-40' : 'mt-2 max-h-16'"
                data-testid="snippet-card-content"
                >{{ s.content }}</pre>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="rounded-md bg-accent px-3 py-1 font-semibold text-accent-ink"
                  data-testid="snippet-copy"
                  (click)="copy(s.id)"
                >
                  {{ 'snippets.copy' | transloco }}
                </button>
                @if (copiedId() === s.id) {
                  <span class="text-xs text-accent" role="status" data-testid="snippet-copied">{{
                    'snippets.copied' | transloco
                  }}</span>
                }
                <button
                  type="button"
                  class="rounded-md border border-line px-3 py-1"
                  data-testid="snippet-edit"
                  (click)="startEdit(s.id)"
                >
                  {{ 'snippets.edit' | transloco }}
                </button>
                @if (confirmingId() === s.id) {
                  <button
                    type="button"
                    class="rounded-md border border-warn px-3 py-1 text-warn"
                    data-testid="snippet-delete-confirm"
                    (click)="remove(s.id)"
                  >
                    {{ 'snippets.confirmYes' | transloco }}
                  </button>
                  <button
                    type="button"
                    class="rounded-md border border-line px-3 py-1"
                    data-testid="snippet-delete-cancel"
                    (click)="confirmingId.set(null)"
                  >
                    {{ 'snippets.confirmNo' | transloco }}
                  </button>
                } @else {
                  <button
                    type="button"
                    class="rounded-md border border-line px-3 py-1"
                    data-testid="snippet-delete"
                    (click)="confirmingId.set(s.id)"
                  >
                    {{ 'snippets.delete' | transloco }}
                  </button>
                }
                <span class="ml-auto flex flex-wrap justify-end gap-1">
                  @for (t of s.tags; track t) {
                    <app-tag-chip [tag]="t" />
                  }
                </span>
              </div>
            </li>
          }
        </ul>
      }
    }
  `,
})
export class SnippetsPage implements OnInit, OnDestroy {
  protected readonly store = inject(SnippetsStore);
  protected readonly types: readonly SnippetType[] = SNIPPET_TYPES;
  protected readonly views = SNIPPETS_VIEWS;
  protected readonly typeFilters = TYPE_FILTERS;
  protected readonly search = signal('');
  protected readonly typeFilter = signal<SnippetTypeFilter>('all');
  protected readonly tagFilter = signal<string | null>(null);
  protected readonly draft = signal<SnippetInput | null>(null);
  protected readonly editingId = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly copiedId = signal<number | null>(null);
  protected readonly confirmingId = signal<number | null>(null);
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly visible = computed(() =>
    filterSnippets(this.store.snippets(), this.typeFilter(), this.tagFilter(), this.search()),
  );

  ngOnInit(): void {
    void this.store.load();
  }

  ngOnDestroy(): void {
    clearTimeout(this.copiedTimer);
  }

  protected startNew(): void {
    this.editingId.set(null);
    this.begin(emptyDraft());
  }

  protected startEdit(id: number): void {
    const snippet = this.store.snippets().find((s) => s.id === id);
    if (!snippet) return;
    const { title, type, content, tags } = snippet;
    this.editingId.set(id);
    this.begin({ title, type, content, tags: [...tags] });
  }

  private begin(draft: SnippetInput): void {
    this.confirmingId.set(null);
    this.error.set(null);
    this.draft.set(draft);
  }

  protected stopEditing(): void {
    this.draft.set(null);
    this.editingId.set(null);
    this.error.set(null);
  }

  protected patch(change: Partial<SnippetInput>): void {
    this.draft.update((d) => (d ? { ...d, ...change } : d));
    this.error.set(null);
  }

  protected async save(): Promise<void> {
    const d = this.draft();
    if (!d) return;
    const id = this.editingId();
    let failure: SnippetError | null;
    try {
      failure = id === null ? await this.store.create(d) : await this.store.update(id, d);
    } catch {
      this.error.set(SNIPPET_ERROR_KEYS.invalid);
      return;
    }
    if (failure) {
      this.error.set(SNIPPET_ERROR_KEYS[failure]);
      return;
    }
    // Make sure the saved snippet is not hidden by the current filters.
    this.typeFilter.set('all');
    this.tagFilter.set(null);
    this.search.set('');
    this.stopEditing();
  }

  protected async copy(id: number): Promise<void> {
    const snippet = this.store.snippets().find((s) => s.id === id);
    if (!snippet || !(await this.store.copy(snippet))) return;
    clearTimeout(this.copiedTimer);
    this.copiedId.set(id);
    this.copiedTimer = setTimeout(() => this.copiedId.set(null), COPIED_FEEDBACK_MS);
  }

  protected async remove(id: number): Promise<void> {
    await this.store.remove(id);
    this.confirmingId.set(null);
    if (this.editingId() === id) this.stopEditing();
  }
}
