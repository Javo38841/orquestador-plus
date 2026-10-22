import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  BUG_SEVERITIES,
  BUG_STATUSES,
  bugAgeDays,
  DEFAULT_SEVERITY,
  isOpenBug,
  filterBugs,
  type BugError,
  type BugFilter,
  type BugInput,
  type BugSeverity,
  type BugStatus,
} from '../../../../shared/bugs';
import { BugStatusBadge } from '../../shared/ui/bug-status-badge';
import { SegmentedTabs, type TabItem } from '../../shared/ui/segmented-tabs';
import { SeverityBadge } from '../../shared/ui/severity-badge';
import { BugsStore } from './bugs.store';

export const BUG_ERROR_KEYS: Record<BugError, string> = {
  empty: 'bugs.errors.empty',
  too_long: 'bugs.errors.tooLong',
  invalid: 'bugs.errors.invalid',
  not_found: 'bugs.errors.notFound',
};

const FILTERS: BugFilter[] = ['all', 'open', 'resolved'];

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
  imports: [TranslocoPipe, SegmentedTabs, SeverityBadge, BugStatusBadge],
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
      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section>
          <div class="mb-3">
            <app-segmented-tabs
              [tabs]="tabs()"
              [selected]="filter()"
              (selectedChange)="setFilter($event)"
            />
          </div>
          @if (visible().length === 0) {
            <div
              class="rounded-lg border border-line bg-surface px-4 py-4 text-sm text-muted"
              data-testid="bugs-empty-filter"
            >
              <p class="mb-3">{{ 'bugs.emptyFilter' | transloco }}</p>
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
            <ul class="space-y-2" data-testid="bug-list">
              @for (b of visible(); track b.id) {
                <li>
                  <button
                    type="button"
                    class="block w-full rounded-lg border bg-surface px-3 py-2 text-left text-sm"
                    [class]="selectedId() === b.id ? 'border-accent' : 'border-line'"
                    data-testid="bug-row"
                    (click)="select(b.id)"
                  >
                    <span class="flex items-center justify-between gap-3">
                      <span class="font-mono text-xs text-muted" data-testid="bug-code">{{
                        b.code
                      }}</span>
                      <span data-testid="bug-severity-chip"
                        ><app-severity-badge [severity]="b.severity"
                      /></span>
                    </span>
                    <span class="mt-1 block truncate font-medium">{{ b.title }}</span>
                    <span class="mt-1 block" data-testid="bug-status-chip"
                      ><app-bug-status-badge [status]="b.status"
                    /></span>
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
          } @else if (sheetBug(); as bug) {
            <article
              class="space-y-4 rounded-lg border border-line bg-surface p-5 text-sm"
              data-testid="bug-sheet"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <p class="text-xs text-muted" data-testid="sheet-header">
                  <span class="font-mono" data-testid="sheet-code">{{ bug.code }}</span>
                  · {{ ageText() }}
                </p>
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
              <h2 class="text-2xl font-semibold" data-testid="sheet-title">{{ bug.title }}</h2>
              <div class="flex flex-wrap gap-2" role="group" data-testid="bug-status">
                @for (s of statuses; track s) {
                  <button
                    type="button"
                    class="rounded-full border px-3 py-1 text-xs font-medium"
                    [class]="
                      bug.status === s
                        ? 'border-accent bg-accent text-accent-ink'
                        : 'border-line text-muted'
                    "
                    [attr.aria-pressed]="bug.status === s"
                    [attr.data-testid]="'status-' + s"
                    (click)="changeStatus(s)"
                  >
                    {{ 'bugs.status.' + s | transloco }}
                  </button>
                }
              </div>
              @if (error(); as key) {
                <p class="text-warn" role="alert" data-testid="bug-error">
                  {{ key | transloco }}
                </p>
              }
              @for (field of textFields; track field) {
                <div>
                  <h3 class="text-xs font-semibold tracking-wide text-muted">
                    {{ 'bugs.sections.' + field | transloco }}
                  </h3>
                  @if (bug[field]; as text) {
                    <p class="mt-1 whitespace-pre-wrap" [attr.data-testid]="'sheet-' + field">
                      {{ text }}
                    </p>
                  } @else {
                    <p
                      class="mt-1 italic text-muted"
                      [attr.data-testid]="'sheet-' + field"
                      data-unfilled="true"
                    >
                      {{ 'bugs.unfilled' | transloco }}
                    </p>
                  }
                </div>
              }
            </article>
          } @else if (visible().length > 0) {
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
  private readonly transloco = inject(TranslocoService);
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

  /** The sheet is hidden when the active filter has no bugs. */
  protected readonly sheetBug = computed(() =>
    this.visible().length > 0 ? this.selected() : null,
  );
  protected readonly tabs = computed<TabItem[]>(() => {
    const bugs = this.store.bugs();
    return this.filters.map((f) => ({
      id: f,
      label: this.transloco.translate(`bugs.filters.${f}`),
      count: filterBugs(bugs, f).length,
    }));
  });

  /** "abierto hace 3 días" for open bugs, "registrado hace 3 días" for the others. */
  protected ageText(): string {
    const bug = this.sheetBug();
    if (!bug) return '';
    const days = bugAgeDays(bug.createdAt);
    const when =
      days === 0
        ? this.transloco.translate('bugs.age.today')
        : days === 1
          ? this.transloco.translate('bugs.age.oneDay')
          : this.transloco.translate('bugs.age.days', { days });
    const kind = this.transloco.translate(isOpenBug(bug) ? 'bugs.age.open' : 'bugs.age.other');
    return `${kind} ${when}`;
  }

  protected setFilter(id: string): void {
    this.filter.set(id as BugFilter);
  }

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
    // Follow the bug to the tab that now holds it so its sheet stays on screen.
    if (!failure && this.filter() !== 'all' && !this.visible().some((b) => b.id === id)) {
      this.filter.set(this.filter() === 'open' ? 'resolved' : 'open');
    }
  }

  protected async remove(): Promise<void> {
    const id = this.selectedId();
    if (id === null) return;
    await this.store.remove(id);
    this.selectedId.set(null);
    this.confirmingDelete.set(false);
  }
}
