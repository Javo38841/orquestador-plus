import {
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SEARCH_KINDS, type SearchKind, type SearchResult } from '../../../../shared/search';
import { DESKTOP_API } from '../../core/desktop-api';

export const SEARCH_DEBOUNCE_MS = 150;

const GROUP_KEYS: Record<SearchKind, string> = {
  task: 'search.groups.task',
  inbox: 'search.groups.inbox',
  note: 'search.groups.note',
};

/** Where each kind of result lives. */
function destination(result: SearchResult): {
  path: string;
  query?: Record<string, string | number>;
} {
  switch (result.kind) {
    case 'task':
      return { path: '/tasks', query: { task: result.id } };
    case 'note':
      return {
        path: '/wiki',
        query: { note: result.slug ?? '', ...(result.heading && { heading: result.heading }) },
      };
    default:
      return { path: '/inbox' };
  }
}

/** Global search palette (RF-10), opened with Ctrl K: results grouped by kind, keyboard driven. */
@Component({
  selector: 'app-search-palette',
  imports: [TranslocoPipe],
  template: `
    <div
      class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-32"
      role="presentation"
      (click)="closed.emit()"
    >
      <div
        class="w-full max-w-xl rounded-xl border border-line bg-surface-raised p-4 shadow-xl"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'search.title' | transloco"
        tabindex="-1"
        (click)="$event.stopPropagation()"
        (keydown)="$event.stopPropagation()"
      >
        <input
          #field
          type="text"
          class="w-full rounded-md border border-line bg-canvas px-3 py-2 text-ink outline-none focus:border-accent"
          data-testid="search-input"
          maxlength="200"
          [placeholder]="'search.placeholder' | transloco"
          [attr.aria-label]="'search.title' | transloco"
          [value]="text()"
          (input)="onInput($event)"
          (keydown)="onKeydown($event)"
        />

        @if (searched() && flat().length === 0) {
          <p class="mt-3 text-sm text-muted" data-testid="search-empty">
            {{ 'search.empty' | transloco }}
          </p>
        }

        @for (group of groups(); track group.kind) {
          <h3 class="mt-3 mb-1 text-[11px] font-semibold tracking-widest text-muted uppercase">
            {{ group.labelKey | transloco }}
          </h3>
          <ul role="listbox">
            @for (result of group.results; track result.id) {
              <li
                role="option"
                class="cursor-pointer rounded-md px-3 py-1.5 text-sm"
                [class.bg-surface]="isActive(result)"
                [attr.aria-selected]="isActive(result)"
                data-testid="search-result"
                tabindex="-1"
                (click)="open(result)"
                (keydown.enter)="open(result)"
                (mouseenter)="activate(result)"
              >
                {{ result.title }}
                @if (result.kind === 'note') {
                  @if (result.section) {
                    <span class="ml-2 text-xs text-muted" data-testid="search-result-section">{{
                      result.section
                    }}</span>
                  }
                  @if (result.snippet) {
                    <span
                      class="block truncate text-xs text-muted"
                      data-testid="search-result-snippet"
                      >{{ result.snippet }}</span
                    >
                  }
                }
              </li>
            }
          </ul>
        }

        <p class="mt-3 text-xs text-muted">{{ 'search.hint' | transloco }}</p>
      </div>
    </div>
  `,
})
export class SearchPalette implements OnDestroy {
  private readonly api = inject(DESKTOP_API);
  private readonly router = inject(Router);
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private timer: ReturnType<typeof setTimeout> | undefined;
  private requestId = 0;

  readonly closed = output<void>();
  protected readonly text = signal('');
  protected readonly results = signal<SearchResult[]>([]);
  protected readonly searched = signal(false);
  protected readonly activeIndex = signal(0);

  /** Results by kind in a fixed order; this order is also the keyboard navigation order. */
  protected readonly groups = computed(() =>
    SEARCH_KINDS.map((kind) => ({
      kind,
      labelKey: GROUP_KEYS[kind],
      results: this.results().filter((r) => r.kind === kind),
    })).filter((g) => g.results.length > 0),
  );
  protected readonly flat = computed(() => this.groups().flatMap((g) => g.results));

  constructor() {
    queueMicrotask(() => this.field().nativeElement.focus());
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
    this.requestId++;
  }

  protected isActive(result: SearchResult): boolean {
    return this.flat()[this.activeIndex()] === result;
  }

  protected activate(result: SearchResult): void {
    this.activeIndex.set(this.flat().indexOf(result));
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.text.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(value), SEARCH_DEBOUNCE_MS);
  }

  private async run(query: string): Promise<void> {
    const id = ++this.requestId;
    if (!this.api || query.trim() === '') {
      this.results.set([]);
      this.searched.set(false);
      return;
    }
    let found: SearchResult[];
    try {
      found = await this.api.search(query);
    } catch {
      found = [];
    }
    if (id !== this.requestId) return; // a newer query superseded this one
    this.results.set(found);
    this.activeIndex.set(0);
    this.searched.set(true);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.flat().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (count > 0) this.activeIndex.update((i) => (i + 1) % count);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count > 0) this.activeIndex.update((i) => (i - 1 + count) % count);
        break;
      case 'Enter': {
        event.preventDefault();
        const active = this.flat()[this.activeIndex()];
        if (active) this.open(active);
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.closed.emit();
        break;
    }
  }

  protected open(result: SearchResult): void {
    const { path, query } = destination(result);
    void this.router.navigate([path], { queryParams: query });
    this.closed.emit();
  }
}
