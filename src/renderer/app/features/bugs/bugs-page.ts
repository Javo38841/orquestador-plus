import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  BUG_SEVERITIES,
  BUG_STATUSES,
  DEFAULT_SEVERITY,
  filterBugs,
  type BugError,
  type BugFilter,
  type BugInput,
  type BugSeverity,
  type BugStatus,
} from '../../../../shared/bugs';
import { BugsStore } from './bugs.store';

export const BUG_ERROR_KEYS: Record<BugError, string> = {
  empty: 'bugs.errors.empty',
  too_long: 'bugs.errors.tooLong',
  invalid: 'bugs.errors.invalid',
  not_found: 'bugs.errors.notFound',
};

const FILTERS: BugFilter[] = ['open', 'resolved', 'all'];

const emptyDraft = (): BugInput => ({
  title: '',
  symptom: '',
  impact: '',
  rootCause: '',
  solution: '',
  severity: DEFAULT_SEVERITY,
});

const TEXT_FIELDS = ['symptom', 'impact', 'rootCause', 'solution'] as const;

/** Bugs e incidencias (RF-09): filtered list, bug sheet and a form to create or edit. */
@Component({
  selector: 'app-bugs-page',
  imports: [TranslocoPipe],
  template: `
    <header class="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold">{{ 'nav.bugs' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted">{{ 'pages.bugs' | transloco }}</p>
      </div>
      <button
        type="button"
        class="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink"
        data-testid="new-bug"
        (click)="startNew()"
      >
        {{ 'bugs.new' | transloco }}
      </button>
    </header>

    @if (store.bugs().length === 0 && !editing()) {
      <div
        class="rounded-lg border border-line bg-surface px-5 py-6 text-sm text-muted"
        data-testid="bugs-empty"
      >
        <p class="mb-3">{{ 'bugs.empty' | transloco }}</p>
        <button
          type="button"
          class="rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink"
          data-testid="empty-new-bug"
          (click)="startNew()"
        >
          {{ 'bugs.new' | transloco }}
        </button>
      </div>
    } @else {
      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section>
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
                {{ 'bugs.filters.' + f | transloco }}
              </button>
            }
          </div>
          @if (visible().length === 0) {
            <p class="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
              {{ 'bugs.emptyFilter' | transloco }}
            </p>
          } @else {
            <ul class="space-y-1" data-testid="bug-list">
              @for (b of visible(); track b.id) {
                <li>
                  <button
                    type="button"
                    class="flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm"
                    [class]="selectedId() === b.id ? 'border-accent' : 'border-line'"
                    data-testid="bug-row"
                    (click)="select(b.id)"
                  >
                    <span class="font-mono text-xs text-muted" data-testid="bug-code">{{
                      b.code
                    }}</span>
                    <span class="min-w-0 flex-1 truncate">{{ b.title }}</span>
                    <span class="text-xs text-muted" data-testid="bug-severity-chip">{{
                      'bugs.severity.' + b.severity | transloco
                    }}</span>
                    <span
                      class="rounded-full border border-line px-2 text-xs"
                      data-testid="bug-status-chip"
                      >{{ 'bugs.status.' + b.status | transloco }}</span
                    >
                  </button>
                </li>
              }
            </ul>
          }
        </section>

        <section class="min-w-0">
          @if (editing() && draft(); as d) {
            <form
              class="space-y-3 text-sm"
              data-testid="bug-form"
              (submit)="$event.preventDefault(); save()"
            >
              <label class="block">
                <span class="text-muted">{{ 'bugs.fields.title' | transloco }}</span>
                <input
                  type="text"
                  class="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-ink outline-none focus:border-accent"
                  data-testid="bug-title"
                  [value]="d.title"
                  (input)="patch({ title: $any($event.target).value })"
                />
              </label>
              <label class="block">
                <span class="text-muted">{{ 'bugs.fields.severity' | transloco }}</span>
                <select
                  class="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-ink"
                  data-testid="bug-severity"
                  [value]="d.severity"
                  (change)="patch({ severity: $any($event.target).value })"
                >
                  @for (s of severities; track s) {
                    <option [value]="s" [selected]="d.severity === s">
                      {{ 'bugs.severity.' + s | transloco }}
                    </option>
                  }
                </select>
              </label>
              @for (field of textFields; track field) {
                <label class="block">
                  <span class="text-muted">{{ 'bugs.fields.' + field | transloco }}</span>
                  <textarea
                    class="mt-1 h-20 w-full rounded-md border border-line bg-canvas px-3 py-2 text-ink outline-none focus:border-accent"
                    [attr.data-testid]="'bug-' + field"
                    [value]="d[field]"
                    (input)="patchText(field, $any($event.target).value)"
                  ></textarea>
                </label>
              }
              @if (error(); as key) {
                <p class="text-warn" role="alert" data-testid="bug-error">
                  {{ key | transloco }}
                </p>
              }
              <div class="flex gap-2">
                <button
                  type="submit"
                  class="rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink"
                  data-testid="bug-save"
                >
                  {{ 'bugs.save' | transloco }}
                </button>
                <button
                  type="button"
                  class="rounded-md border border-line px-3 py-2"
                  data-testid="bug-cancel"
                  (click)="stopEditing()"
                >
                  {{ 'bugs.cancel' | transloco }}
                </button>
              </div>
            </form>
          } @else if (selected(); as bug) {
            <article class="space-y-4 text-sm" data-testid="bug-sheet">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="font-mono text-xs text-muted" data-testid="sheet-code">
                    {{ bug.code }}
                  </p>
                  <h2 class="text-xl font-semibold" data-testid="sheet-title">{{ bug.title }}</h2>
                </div>
                <div class="flex gap-2">
                  <button
                    type="button"
                    class="rounded-md border border-line px-3 py-1"
                    data-testid="bug-edit"
                    (click)="startEdit()"
                  >
                    {{ 'bugs.edit' | transloco }}
                  </button>
                  @if (confirmingDelete()) {
                    <button
                      type="button"
                      class="rounded-md border border-warn px-3 py-1 text-warn"
                      data-testid="bug-delete-confirm"
                      (click)="remove()"
                    >
                      {{ 'bugs.confirmYes' | transloco }}
                    </button>
                    <button
                      type="button"
                      class="rounded-md border border-line px-3 py-1"
                      data-testid="bug-delete-cancel"
                      (click)="confirmingDelete.set(false)"
                    >
                      {{ 'bugs.confirmNo' | transloco }}
                    </button>
                  } @else {
                    <button
                      type="button"
                      class="rounded-md border border-line px-3 py-1"
                      data-testid="bug-delete"
                      (click)="confirmingDelete.set(true)"
                    >
                      {{ 'bugs.delete' | transloco }}
                    </button>
                  }
                </div>
              </div>
              @if (confirmingDelete()) {
                <p class="text-warn">{{ 'bugs.confirmDelete' | transloco }}</p>
              }
              <label class="block">
                <span class="text-muted">{{ 'bugs.fields.status' | transloco }}</span>
                <select
                  class="mt-1 block rounded-md border border-line bg-canvas px-3 py-2 text-ink"
                  data-testid="bug-status"
                  (change)="changeStatus($any($event.target).value)"
                >
                  @for (s of statuses; track s) {
                    <option [value]="s" [selected]="bug.status === s">
                      {{ 'bugs.status.' + s | transloco }}
                    </option>
                  }
                </select>
              </label>
              @if (error(); as key) {
                <p class="text-warn" role="alert" data-testid="bug-error">
                  {{ key | transloco }}
                </p>
              }
              <p>
                <span class="text-muted">{{ 'bugs.fields.severity' | transloco }}:</span>
                {{ 'bugs.severity.' + bug.severity | transloco }}
              </p>
              @for (field of textFields; track field) {
                <div>
                  <h3 class="text-muted">{{ 'bugs.fields.' + field | transloco }}</h3>
                  <p class="whitespace-pre-wrap" [attr.data-testid]="'sheet-' + field">
                    {{ bug[field] || '—' }}
                  </p>
                </div>
              }
            </article>
          } @else {
            <p class="rounded-lg border border-line bg-surface px-5 py-4 text-sm text-muted">
              {{ 'bugs.pick' | transloco }}
            </p>
          }
        </section>
      </div>
    }
  `,
})
export class BugsPage implements OnInit {
  protected readonly store = inject(BugsStore);
  protected readonly filters = FILTERS;
  protected readonly severities: readonly BugSeverity[] = BUG_SEVERITIES;
  protected readonly statuses: readonly BugStatus[] = BUG_STATUSES;
  protected readonly textFields = TEXT_FIELDS;
  protected readonly filter = signal<BugFilter>('open');
  protected readonly selectedId = signal<number | null>(null);
  protected readonly editing = signal(false);
  protected readonly draft = signal<BugInput | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmingDelete = signal(false);

  protected readonly visible = computed(() => filterBugs(this.store.bugs(), this.filter()));
  protected readonly selected = computed(
    () => this.store.bugs().find((b) => b.id === this.selectedId()) ?? null,
  );

  ngOnInit(): void {
    void this.store.load();
  }

  protected select(id: number): void {
    this.stopEditing();
    this.selectedId.set(id);
  }

  protected startNew(): void {
    this.selectedId.set(null);
    this.begin(emptyDraft());
  }

  protected startEdit(): void {
    const bug = this.selected();
    if (!bug) return;
    const { title, symptom, impact, rootCause, solution, severity } = bug;
    this.begin({ title, symptom, impact, rootCause, solution, severity });
  }

  private begin(draft: BugInput): void {
    this.confirmingDelete.set(false);
    this.error.set(null);
    this.draft.set(draft);
    this.editing.set(true);
  }

  protected stopEditing(): void {
    this.editing.set(false);
    this.draft.set(null);
    this.error.set(null);
    this.confirmingDelete.set(false);
  }

  protected patch(change: Partial<BugInput>): void {
    this.draft.update((d) => (d ? { ...d, ...change } : d));
    this.error.set(null);
  }

  protected patchText(field: (typeof TEXT_FIELDS)[number], value: string): void {
    this.patch({ [field]: value });
  }

  protected async save(): Promise<void> {
    const d = this.draft();
    if (!d) return;
    const id = this.selectedId();
    const creating = id === null;
    let failure: BugError | null;
    try {
      failure = id === null ? await this.store.create(d) : await this.store.update(id, d);
    } catch {
      this.error.set(BUG_ERROR_KEYS.invalid);
      return;
    }
    if (failure) {
      this.error.set(BUG_ERROR_KEYS[failure]);
      return;
    }
    if (creating) {
      // The new bug is first in the list; show its sheet, in a filter that includes it.
      this.selectedId.set(this.store.bugs()[0]?.id ?? null);
      this.filter.set('open');
    }
    this.stopEditing();
  }

  protected async changeStatus(status: BugStatus): Promise<void> {
    const id = this.selectedId();
    if (id === null) return;
    const failure = await this.store.setStatus(id, status);
    this.error.set(failure ? BUG_ERROR_KEYS[failure] : null);
  }

  protected async remove(): Promise<void> {
    const id = this.selectedId();
    if (id === null) return;
    await this.store.remove(id);
    this.selectedId.set(null);
    this.confirmingDelete.set(false);
  }
}
