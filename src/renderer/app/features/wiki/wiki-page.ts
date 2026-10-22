import { Component, computed, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  extractToc,
  pageNavigation,
  type NoteError,
  type SectionError,
} from '../../../../shared/wiki';
import { SearchLauncher } from '../search/search-launcher';
import { NoteBody } from './note-body';
import { WikiMode } from './wiki-mode';
import { WikiStore } from './wiki.store';
import { WikiTreeComponent, type PageCreator } from './wiki-tree';

export const SECTION_ERROR_KEYS: Record<SectionError, string> = {
  empty: 'wiki.sectionErrors.empty',
  invalid: 'wiki.sectionErrors.invalid',
  duplicate: 'wiki.sectionErrors.duplicate',
  io: 'wiki.sectionErrors.io',
};

export const NOTE_ERROR_KEYS: Record<NoteError, string> = {
  empty: 'wiki.errors.empty',
  too_long: 'wiki.errors.tooLong',
  invalid: 'wiki.errors.invalid',
  duplicate: 'wiki.errors.duplicate',
  not_found: 'wiki.errors.notFound',
  io: 'wiki.errors.io',
};

interface Draft {
  title: string;
  content: string;
}

/**
 * Wiki (RF-08) in documentation mode: own top bar, a sidebar tree of sections, the reading view
 * with backlinks, and a simple editor with preview. Esc goes back to the app.
 */
@Component({
  selector: 'app-wiki-page',
  imports: [TranslocoPipe, NoteBody, WikiTreeComponent],
  host: {
    class: 'flex h-full min-h-0 flex-col',
    '(keydown.escape)': 'onEscape($event)',
    '(document:keydown.escape)': 'onEscape($event)',
  },
  template: `
    <header
      class="grid grid-cols-[1fr_minmax(0,28rem)_1fr] items-center gap-4 border-b border-line bg-canvas px-4 py-2.5"
      data-testid="wiki-topbar"
    >
      <div class="flex min-w-0 items-center gap-2" data-testid="wiki-brand">
        <span
          class="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-sm font-bold text-accent-ink"
          aria-hidden="true"
          data-testid="wiki-logo"
          >O</span
        >
        <span class="truncate font-semibold" data-testid="wiki-name">{{
          'wiki.name' | transloco
        }}</span>
      </div>
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
        data-testid="wiki-search"
        (click)="launcher.open.set(true)"
      >
        <span aria-hidden="true">⌕</span>
        <span class="flex-1 text-left" data-testid="wiki-search-label">{{
          'wiki.search' | transloco
        }}</span>
        <kbd
          class="rounded border border-line px-1.5 font-mono text-xs"
          data-testid="wiki-search-shortcut"
          >{{ 'wiki.searchShortcut' | transloco }}</kbd
        >
      </button>
      <button
        type="button"
        class="flex items-center gap-2 justify-self-end rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-semibold outline-none hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-accent"
        data-testid="wiki-exit"
        (click)="guard(exit)"
      >
        <span aria-hidden="true">←</span>
        <span data-testid="wiki-exit-label">{{ 'wiki.exit' | transloco }}</span>
        <kbd
          class="rounded border border-line px-1.5 font-mono text-xs font-normal text-muted"
          data-testid="wiki-exit-shortcut"
          >{{ 'wiki.exitShortcut' | transloco }}</kbd
        >
      </button>
    </header>
    @if (pending()) {
      <div
        class="mx-6 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-warn bg-surface-raised px-4 py-3 text-sm"
        role="alertdialog"
        data-testid="discard-confirm"
      >
        <span class="text-warn">{{ 'wiki.confirmDiscard' | transloco }}</span>
        <button
          type="button"
          class="rounded-md border border-warn px-3 py-1 text-warn"
          data-testid="discard-yes"
          (click)="discard()"
        >
          {{ 'wiki.discard' | transloco }}
        </button>
        <button
          type="button"
          class="rounded-md border border-line px-3 py-1"
          data-testid="discard-no"
          (click)="pending.set(null)"
        >
          {{ 'wiki.keepEditing' | transloco }}
        </button>
      </div>
    }
    <div class="grid min-h-0 flex-1 md:grid-cols-[16rem_1fr]">
      <nav
        class="min-h-0 space-y-3 overflow-y-auto border-r border-line px-3 py-4"
        [attr.aria-label]="'wiki.sidebar' | transloco"
      >
        <div class="flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
            data-testid="new-note"
            (click)="guard(startNew)"
          >
            {{ 'wiki.new' | transloco }}
          </button>
          <button
            type="button"
            class="flex-1 rounded-md border border-line px-3 py-2 text-sm outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent"
            data-testid="new-section"
            [attr.aria-expanded]="creatingSection()"
            (click)="toggleNewSection()"
          >
            {{ 'wiki.newSection' | transloco }}
          </button>
        </div>
        @if (creatingSection()) {
          <form
            class="space-y-1"
            data-testid="new-section-form"
            (submit)="$event.preventDefault(); createSection(sectionName.value)"
          >
            <input
              #sectionName
              type="text"
              class="w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
              [attr.aria-label]="'wiki.sectionName' | transloco"
              [placeholder]="'wiki.sectionName' | transloco"
              data-testid="new-section-name"
              (input)="sectionError.set(null)"
              (keydown.escape)="$event.preventDefault(); toggleNewSection()"
            />
            @if (sectionError(); as key) {
              <p class="text-xs text-warn" role="alert" data-testid="new-section-error">
                {{ key | transloco }}
              </p>
            }
            <button
              type="submit"
              class="rounded-md bg-accent px-3 py-1 text-sm font-semibold text-accent-ink"
              data-testid="new-section-save"
            >
              {{ 'wiki.create' | transloco }}
            </button>
          </form>
        }
        @if (store.notes().length === 0 && store.sections().length === 0) {
          <p
            class="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted"
            data-testid="wiki-empty"
          >
            {{ 'wiki.empty' | transloco }}
          </p>
        } @else {
          <app-wiki-tree
            data-testid="note-list"
            [tree]="store.tree()"
            [currentSlug]="editing() ? null : (store.current()?.slug ?? null)"
            [createPage]="createPage"
            (opened)="guard(openNote, $event)"
          />
        }
      </nav>
      <section
        #scroller
        class="min-w-0 overflow-y-auto px-10 py-8"
        data-testid="wiki-scroll"
        (scroll)="updateActive()"
      >
        @if (editing() && draft(); as d) {
          <form
            class="space-y-3"
            data-testid="note-editor"
            (submit)="$event.preventDefault(); save()"
          >
            <label class="block text-sm">
              <span class="text-muted">{{ 'wiki.title' | transloco }}</span>
              <input
                type="text"
                class="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-ink outline-none focus:border-accent"
                data-testid="note-title"
                [value]="d.title"
                (input)="patch({ title: $any($event.target).value })"
              />
            </label>
            <div class="grid gap-3 lg:grid-cols-2">
              <label class="block text-sm">
                <span class="text-muted">{{ 'wiki.content' | transloco }}</span>
                <textarea
                  class="mt-1 h-80 w-full rounded-md border border-line bg-canvas px-3 py-2 font-mono text-sm text-ink outline-none focus:border-accent"
                  data-testid="note-content"
                  [value]="d.content"
                  (input)="patch({ content: $any($event.target).value })"
                ></textarea>
              </label>
              <div class="text-sm">
                <span class="text-muted">{{ 'wiki.preview' | transloco }}</span>
                <div
                  class="mt-1 h-80 overflow-auto rounded-md border border-line bg-surface px-3 py-2"
                  data-testid="note-preview"
                >
                  <app-note-body
                    [content]="d.content"
                    [slugs]="store.slugByKey()"
                    [pageTitle]="d.title"
                  />
                </div>
              </div>
            </div>
            @if (error(); as key) {
              <p class="text-sm text-warn" role="alert" data-testid="note-error">
                {{ key | transloco }}
              </p>
            }
            <div class="flex gap-2 text-sm">
              <button
                type="submit"
                class="rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink"
                data-testid="note-save"
              >
                {{ 'wiki.save' | transloco }}
              </button>
              <button
                type="button"
                class="rounded-md border border-line px-3 py-2"
                data-testid="note-cancel"
                (click)="requestCancel()"
              >
                {{ 'wiki.cancel' | transloco }}
              </button>
            </div>
          </form>
        } @else if (store.current(); as note) {
          <article data-testid="note-view">
            <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <nav
                  class="mb-1 flex flex-wrap gap-1 text-xs text-muted"
                  [attr.aria-label]="'wiki.breadcrumbs' | transloco"
                  data-testid="breadcrumbs"
                >
                  @if (store.currentSectionTitle(); as section) {
                    <span data-testid="breadcrumb-section">{{ section }}</span>
                    <span aria-hidden="true">/</span>
                  }
                  <span data-testid="breadcrumb-page">{{ note.title }}</span>
                </nav>
                <h2 class="text-xl font-semibold" data-testid="note-view-title">
                  {{ note.title }}
                </h2>
                @if (note.description; as description) {
                  <p class="mt-1 text-muted" data-testid="note-description">{{ description }}</p>
                }
              </div>
              <div class="flex gap-2 text-sm">
                <button
                  type="button"
                  class="rounded-md border border-line px-3 py-1"
                  data-testid="note-edit"
                  (click)="startEdit()"
                >
                  {{ 'wiki.edit' | transloco }}
                </button>
                @if (confirmingDelete()) {
                  <button
                    type="button"
                    class="rounded-md border border-warn px-3 py-1 text-warn"
                    data-testid="note-delete-confirm"
                    (click)="remove()"
                  >
                    {{ 'wiki.confirmDelete' | transloco }}
                  </button>
                } @else {
                  <button
                    type="button"
                    class="rounded-md border border-line px-3 py-1"
                    data-testid="note-delete"
                    (click)="confirmingDelete.set(true)"
                  >
                    {{ 'wiki.delete' | transloco }}
                  </button>
                }
              </div>
            </div>
            <div class="grid gap-8 lg:grid-cols-[1fr_14rem]">
              <div class="min-w-0">
                <app-note-body
                  [content]="note.content"
                  [slugs]="store.slugByKey()"
                  [pageTitle]="note.title"
                  (openLink)="guard(openNote, $event)"
                />
                <footer class="mt-8 space-y-4 border-t border-line pt-4" data-testid="page-footer">
                  <div class="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <button
                      type="button"
                      class="rounded-md border border-line px-3 py-1 outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent"
                      data-testid="page-edit"
                      (click)="startEdit()"
                    >
                      {{ 'wiki.editPage' | transloco }}
                    </button>
                    <span class="text-xs text-muted" data-testid="page-updated">
                      {{ 'wiki.lastUpdated' | transloco: { date: longDate(note.updatedAt) } }}
                    </span>
                  </div>
                  <div class="flex justify-between gap-3 text-sm">
                    @if (navigation().previous; as previous) {
                      <button
                        type="button"
                        class="rounded-md border border-line px-3 py-2 text-left outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent"
                        data-testid="page-prev"
                        (click)="guard(openNote, previous.slug)"
                      >
                        <span class="block text-xs text-muted">{{
                          'wiki.previous' | transloco
                        }}</span>
                        {{ previous.title }}
                      </button>
                    } @else {
                      <span></span>
                    }
                    @if (navigation().next; as next) {
                      <button
                        type="button"
                        class="rounded-md border border-line px-3 py-2 text-right outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent"
                        data-testid="page-next"
                        (click)="guard(openNote, next.slug)"
                      >
                        <span class="block text-xs text-muted">{{ 'wiki.next' | transloco }}</span>
                        {{ next.title }}
                      </button>
                    }
                  </div>
                </footer>
              </div>
              <aside
                class="space-y-6 text-sm lg:sticky lg:top-0 lg:self-start"
                data-testid="page-aside"
              >
                <nav [attr.aria-label]="'wiki.onThisPage' | transloco" data-testid="toc">
                  <h3 class="mb-2 text-xs font-semibold tracking-widest text-muted uppercase">
                    {{ 'wiki.onThisPage' | transloco }}
                  </h3>
                  @if (toc().length === 0) {
                    <p class="text-muted" data-testid="toc-empty">
                      {{ 'wiki.noHeadings' | transloco }}
                    </p>
                  } @else {
                    <ul class="space-y-1">
                      @for (entry of toc(); track entry.id) {
                        <li [class.ml-3]="entry.level === 3">
                          <button
                            type="button"
                            class="w-full rounded px-1 py-0.5 text-left outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
                            [class]="
                              entry.id === activeId() ? 'font-semibold text-accent' : 'text-muted'
                            "
                            [attr.aria-current]="entry.id === activeId() ? 'location' : null"
                            [attr.data-toc-id]="entry.id"
                            data-testid="toc-item"
                            (click)="goToHeading(entry.id)"
                          >
                            {{ entry.text }}
                          </button>
                        </li>
                      }
                    </ul>
                  }
                </nav>
                <section data-testid="backlinks">
                  <h3 class="mb-2 text-xs font-semibold tracking-widest text-muted uppercase">
                    {{ 'wiki.backlinks' | transloco }}
                  </h3>
                  @if (note.backlinks.length === 0) {
                    <p class="text-muted">{{ 'wiki.noBacklinks' | transloco }}</p>
                  } @else {
                    <ul class="space-y-1">
                      @for (b of note.backlinks; track b.slug) {
                        <li>
                          <button
                            type="button"
                            class="rounded text-left text-accent underline outline-none focus-visible:ring-2 focus-visible:ring-accent"
                            data-testid="backlink"
                            (click)="guard(openNote, b.slug)"
                          >
                            {{ b.title }}
                          </button>
                        </li>
                      }
                    </ul>
                  }
                </section>
              </aside>
            </div>
          </article>
        } @else {
          <p class="rounded-lg border border-line bg-surface px-5 py-4 text-sm text-muted">
            {{ 'wiki.pick' | transloco }}
          </p>
        }
      </section>
    </div>
  `,
})
export class WikiPage implements OnInit {
  protected readonly store = inject(WikiStore);
  private readonly mode = inject(WikiMode);
  protected readonly launcher = inject(SearchLauncher);
  private readonly transloco = inject(TranslocoService);
  protected readonly editing = signal(false);
  protected readonly draft = signal<Draft | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmingDelete = signal(false);
  protected readonly creatingSection = signal(false);
  protected readonly sectionError = signal<string | null>(null);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  /** Index entry the reader is on; null = the first one. */
  private readonly reached = signal<string | null>(null);
  protected readonly toc = computed(() => extractToc(this.store.current()?.content ?? ''));
  protected readonly activeId = computed(() => this.reached() ?? this.toc()[0]?.id ?? null);
  protected readonly navigation = computed(() => {
    const slug = this.store.current()?.slug;
    return slug ? pageNavigation(this.store.tree(), slug) : { previous: null, next: null };
  });
  /** Action waiting for the user to confirm discarding unsaved changes. */
  protected readonly pending = signal<(() => void) | null>(null);
  /** Slug of the note being edited; null while creating a new one. */
  private editingSlug: string | null = null;

  private readonly dirty = computed(() => {
    const d = this.draft();
    if (!this.editing() || !d) return false;
    const current = this.editingSlug === null ? null : this.store.current();
    return d.title !== (current?.title ?? '') || d.content !== (current?.content ?? '');
  });

  ngOnInit(): void {
    void this.store.load();
  }

  /** Runs `action`, asking first if there are unsaved changes. */
  protected guard<A extends unknown[]>(action: (...args: A) => void, ...args: A): void {
    const run = (): void => action.apply(this, args);
    if (this.dirty()) this.pending.set(run);
    else run();
  }

  protected toggleNewSection(): void {
    this.sectionError.set(null);
    this.creatingSection.update((open) => !open);
  }

  protected async createSection(name: string): Promise<void> {
    let failure: SectionError | null;
    try {
      failure = await this.store.createSection(name);
    } catch {
      failure = 'io';
    }
    if (failure) {
      this.sectionError.set(SECTION_ERROR_KEYS[failure]);
      return;
    }
    this.creatingSection.set(false);
  }

  /** "+" of a section: creates an empty page there and opens it (asking first if unsaved). */
  protected readonly createPage: PageCreator = async (section, title) => {
    if (this.dirty()) {
      this.pending.set(() => void this.createPage(section, title));
      return null;
    }
    let failure: NoteError | null;
    try {
      failure = await this.store.create({ title, content: '', section });
    } catch {
      failure = 'io';
    }
    if (failure) return NOTE_ERROR_KEYS[failure];
    this.stopEditing();
    this.reached.set(null);
    return null;
  };

  protected readonly startNew = (): void => {
    this.editingSlug = null;
    this.beginEdit({ title: '', content: '' });
  };

  protected readonly openNote = (slug: string): void => {
    this.stopEditing();
    this.reached.set(null);
    void this.store.openNote(slug).then(() => {
      const scroller = this.scroller()?.nativeElement;
      if (scroller) scroller.scrollTop = 0;
    });
  };

  /** Scrolls to a heading of the page and marks it as the current one. */
  protected goToHeading(id: string): void {
    const heading = this.headingElements().find((h) => h.dataset['headingId'] === id);
    heading?.scrollIntoView?.({ block: 'start' });
    this.reached.set(id);
  }

  /** Marks as current the last heading that has reached the top of the scrolling area. */
  protected updateActive(): void {
    const scroller = this.scroller()?.nativeElement;
    if (!scroller) return;
    const top = scroller.getBoundingClientRect().top + 24;
    let current: string | null = null;
    for (const heading of this.headingElements()) {
      if (heading.getBoundingClientRect().top > top) break;
      current = heading.dataset['headingId'] ?? null;
    }
    // At the very bottom the last heading may never reach the top: it counts as reached.
    const atBottom =
      scroller.scrollHeight > scroller.clientHeight &&
      scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
    const last = this.headingElements().at(-1)?.dataset['headingId'] ?? null;
    this.reached.set(atBottom ? last : current);
  }

  private headingElements(): HTMLElement[] {
    const scroller = this.scroller()?.nativeElement;
    return scroller ? Array.from(scroller.querySelectorAll<HTMLElement>('[data-heading-id]')) : [];
  }

  protected startEdit(): void {
    const note = this.store.current();
    if (!note) return;
    this.editingSlug = note.slug;
    this.beginEdit({ title: note.title, content: note.content });
  }

  private beginEdit(draft: Draft): void {
    this.confirmingDelete.set(false);
    this.error.set(null);
    this.draft.set(draft);
    this.editing.set(true);
  }

  private stopEditing(): void {
    this.editing.set(false);
    this.draft.set(null);
    this.error.set(null);
    this.confirmingDelete.set(false);
    this.pending.set(null);
  }

  /** Leaves the Wiki for the screen it was entered from. */
  protected readonly exit = (): void => {
    this.stopEditing();
    this.mode.exit();
  };

  protected requestCancel(): void {
    this.guard(() => this.stopEditing());
  }

  /** Esc closes the editor first (asking if there are changes); otherwise it leaves the Wiki. */
  protected onEscape(event: Event): void {
    // Handled already, or meant for a dialog on top (quick capture, global search).
    if (event.defaultPrevented || (event.target as Element | null)?.closest?.('[role="dialog"]')) {
      return;
    }
    event.preventDefault();
    if (this.editing()) this.requestCancel();
    else this.guard(this.exit);
  }

  protected discard(): void {
    const run = this.pending();
    this.pending.set(null);
    this.stopEditing();
    run?.();
  }

  protected patch(change: Partial<Draft>): void {
    this.draft.update((d) => (d ? { ...d, ...change } : d));
    this.error.set(null);
  }

  protected async save(): Promise<void> {
    const d = this.draft();
    if (!d) return;
    let failure: NoteError | null;
    try {
      failure =
        this.editingSlug === null
          ? await this.store.create(d)
          : await this.store.save(this.editingSlug, d);
    } catch {
      this.error.set(NOTE_ERROR_KEYS.io);
      return;
    }
    if (failure) {
      this.error.set(NOTE_ERROR_KEYS[failure]);
      return;
    }
    this.stopEditing();
  }

  protected async remove(): Promise<void> {
    const note = this.store.current();
    if (!note) return;
    await this.store.remove(note.slug);
    this.confirmingDelete.set(false);
  }

  protected longDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es', { dateStyle: 'long' });
  }

  /** Route guard: true when leaving loses nothing, or the user agrees to discard. */
  confirmLeave(): boolean {
    return !this.dirty() || window.confirm(this.transloco.translate('wiki.confirmDiscard'));
  }
}
