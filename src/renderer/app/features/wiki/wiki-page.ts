import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { NoteError } from '../../../../shared/wiki';
import { NoteBody } from './note-body';
import { WikiStore } from './wiki.store';

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

/** Wiki (RF-08): note list, reading view with backlinks, and a simple editor with preview. */
@Component({
  selector: 'app-wiki-page',
  imports: [TranslocoPipe, NoteBody],
  host: { '(keydown.escape)': 'onEscape($event)' },
  template: `
    <header class="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold">{{ 'nav.wiki' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted">{{ 'pages.wiki' | transloco }}</p>
      </div>
      <button
        type="button"
        class="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink"
        data-testid="new-note"
        (click)="guard(startNew)"
      >
        {{ 'wiki.new' | transloco }}
      </button>
    </header>
    @if (pending()) {
      <div
        class="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-warn bg-surface-raised px-4 py-3 text-sm"
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
    <div class="grid gap-6 md:grid-cols-[16rem_1fr]">
      <nav [attr.aria-label]="'nav.wiki' | transloco">
        @if (store.notes().length === 0) {
          <p class="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
            {{ 'wiki.empty' | transloco }}
          </p>
        } @else {
          <ul class="space-y-1" data-testid="note-list">
            @for (n of store.notes(); track n.slug) {
              <li>
                <button
                  type="button"
                  class="w-full truncate rounded-md border px-3 py-2 text-left text-sm"
                  [class]="
                    store.current()?.slug === n.slug && !editing()
                      ? 'border-accent text-accent'
                      : 'border-line'
                  "
                  data-testid="note-item"
                  (click)="guard(openNote, n.slug)"
                >
                  {{ n.title }}
                </button>
              </li>
            }
          </ul>
        }
      </nav>
      <section class="min-w-0">
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
                  <app-note-body [content]="d.content" [slugs]="store.slugByKey()" />
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
                <h2 class="text-xl font-semibold" data-testid="note-view-title">
                  {{ note.title }}
                </h2>
                <p class="text-xs text-muted">
                  {{ 'wiki.updated' | transloco }} {{ date(note.updatedAt) }}
                </p>
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
            <app-note-body
              [content]="note.content"
              [slugs]="store.slugByKey()"
              (openLink)="guard(openNote, $event)"
            />
            <aside class="mt-8 border-t border-line pt-4" data-testid="backlinks">
              <h3 class="mb-2 text-sm font-semibold">{{ 'wiki.backlinks' | transloco }}</h3>
              @if (note.backlinks.length === 0) {
                <p class="text-sm text-muted">{{ 'wiki.noBacklinks' | transloco }}</p>
              } @else {
                <ul class="space-y-1 text-sm">
                  @for (b of note.backlinks; track b.slug) {
                    <li>
                      <button
                        type="button"
                        class="text-accent underline"
                        data-testid="backlink"
                        (click)="guard(openNote, b.slug)"
                      >
                        {{ b.title }}
                      </button>
                    </li>
                  }
                </ul>
              }
            </aside>
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
  private readonly transloco = inject(TranslocoService);
  protected readonly editing = signal(false);
  protected readonly draft = signal<Draft | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmingDelete = signal(false);
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

  protected readonly startNew = (): void => {
    this.editingSlug = null;
    this.beginEdit({ title: '', content: '' });
  };

  protected readonly openNote = (slug: string): void => {
    this.stopEditing();
    void this.store.openNote(slug);
  };

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

  protected requestCancel(): void {
    this.guard(() => this.stopEditing());
  }

  protected onEscape(event: Event): void {
    if (!this.editing()) return;
    event.preventDefault();
    this.requestCancel();
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

  protected date(iso: string): string {
    return new Date(iso).toLocaleDateString('es');
  }

  /** Route guard: true when leaving loses nothing, or the user agrees to discard. */
  confirmLeave(): boolean {
    return !this.dirty() || window.confirm(this.transloco.translate('wiki.confirmDiscard'));
  }
}
