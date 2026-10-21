import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { localJournalDate, type JournalError } from '../../../../shared/journal';
import { JournalStore } from './journal.store';

export const JOURNAL_ERROR_KEYS: Record<JournalError, string> = {
  invalid: 'journal.errors.invalid',
  too_long: 'journal.errors.tooLong',
};

/** Bitácora (RF-12): today's entry ready to edit, then the previous days. */
@Component({
  selector: 'app-journal-page',
  imports: [TranslocoPipe],
  template: `
    <header class="mb-6">
      <h1 class="text-2xl font-semibold">{{ 'nav.journal' | transloco }}</h1>
      <p class="mt-1 text-sm text-muted">{{ 'pages.journal' | transloco }}</p>
    </header>

    <section class="mb-8 space-y-3 text-sm" data-testid="journal-today">
      <h2 class="font-semibold">
        {{ 'journal.today' | transloco }}
        <span class="font-mono text-xs text-muted" data-testid="journal-today-date">{{
          today
        }}</span>
      </h2>
      <textarea
        rows="8"
        class="w-full rounded-md border border-line bg-canvas px-3 py-2 text-ink outline-none focus:border-accent"
        data-testid="journal-text"
        [placeholder]="'journal.placeholder' | transloco"
        [value]="todayText()"
        (input)="todayText.set($any($event.target).value); status.set(null)"
      ></textarea>
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink"
          data-testid="journal-save"
          (click)="saveToday()"
        >
          {{ 'journal.save' | transloco }}
        </button>
        @if (status() === 'saved') {
          <span class="text-muted" data-testid="journal-saved">{{
            'journal.saved' | transloco
          }}</span>
        }
        @if (error(); as key) {
          <span class="text-red-500" role="alert" data-testid="journal-error">{{
            key | transloco
          }}</span>
        }
      </div>
    </section>

    @if (store.entries().length === 0) {
      <p
        class="rounded-lg border border-line bg-surface px-5 py-6 text-sm text-muted"
        data-testid="journal-empty"
      >
        {{ 'journal.empty' | transloco }}
      </p>
    }

    @if (previous().length > 0) {
      <section data-testid="journal-previous">
        <h2 class="mb-3 text-sm font-semibold">{{ 'journal.previous' | transloco }}</h2>
        <ul class="space-y-3">
          @for (e of previous(); track e.date) {
            <li
              class="rounded-lg border border-line bg-surface p-4 text-sm"
              data-testid="journal-entry"
            >
              <div class="mb-2 flex items-center justify-between">
                <span class="font-mono text-xs text-muted" data-testid="journal-entry-date">{{
                  e.date
                }}</span>
                @if (editingDate() !== e.date) {
                  <button
                    type="button"
                    class="text-xs text-accent"
                    data-testid="journal-entry-edit"
                    (click)="startEdit(e.date, e.text)"
                  >
                    {{ 'journal.edit' | transloco }}
                  </button>
                }
              </div>
              @if (editingDate() === e.date) {
                <textarea
                  rows="6"
                  class="w-full rounded-md border border-line bg-canvas px-3 py-2 text-ink outline-none focus:border-accent"
                  data-testid="journal-entry-text"
                  [value]="editText()"
                  (input)="editText.set($any($event.target).value)"
                ></textarea>
                <div class="mt-2 flex gap-2">
                  <button
                    type="button"
                    class="rounded-md bg-accent px-3 py-1 font-semibold text-accent-ink"
                    data-testid="journal-entry-save"
                    (click)="saveEdit()"
                  >
                    {{ 'journal.save' | transloco }}
                  </button>
                  <button
                    type="button"
                    class="rounded-md border border-line px-3 py-1"
                    data-testid="journal-entry-cancel"
                    (click)="editingDate.set(null)"
                  >
                    {{ 'journal.cancel' | transloco }}
                  </button>
                </div>
              } @else {
                <p class="whitespace-pre-wrap" data-testid="journal-entry-body">{{ e.text }}</p>
              }
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class JournalPage implements OnInit {
  protected readonly store = inject(JournalStore);
  protected readonly today = localJournalDate();
  protected readonly todayText = signal('');
  protected readonly status = signal<'saved' | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly editingDate = signal<string | null>(null);
  protected readonly editText = signal('');

  /** Entries of earlier days; today's is edited in the top editor. */
  protected readonly previous = computed(() =>
    this.store.entries().filter((e) => e.date !== this.today),
  );

  async ngOnInit(): Promise<void> {
    await this.store.load();
    const current = this.store.entries().find((e) => e.date === this.today);
    this.todayText.set(current?.text ?? '');
  }

  protected async saveToday(): Promise<void> {
    const failure = await this.store.save(this.today, this.todayText());
    this.error.set(failure ? JOURNAL_ERROR_KEYS[failure] : null);
    this.status.set(failure ? null : 'saved');
  }

  protected startEdit(date: string, text: string): void {
    this.editText.set(text);
    this.editingDate.set(date);
    this.error.set(null);
  }

  protected async saveEdit(): Promise<void> {
    const date = this.editingDate();
    if (!date) return;
    const failure = await this.store.save(date, this.editText());
    this.error.set(failure ? JOURNAL_ERROR_KEYS[failure] : null);
    if (!failure) this.editingDate.set(null);
  }
}
