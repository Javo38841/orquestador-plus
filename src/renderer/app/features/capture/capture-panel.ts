import { Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { CaptureError } from '../../../../shared/inbox';
import { InboxStore } from '../inbox/inbox.store';

const ERROR_KEYS: Record<CaptureError, string> = {
  empty: 'capture.empty',
  too_long: 'capture.tooLong',
};

/** Quick capture panel (RF-01): stays open after saving so several things can be captured. */
@Component({
  selector: 'app-capture-panel',
  imports: [TranslocoPipe],
  template: `
    <div
      class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-32"
      role="presentation"
      (click)="closed.emit()"
      (keydown.escape)="closed.emit()"
    >
      <div
        class="w-full max-w-xl rounded-xl border border-line bg-surface-raised p-4 shadow-xl"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'capture.title' | transloco"
        tabindex="-1"
        (click)="$event.stopPropagation()"
        (keydown)="$event.stopPropagation()"
      >
        <input
          #field
          type="text"
          class="w-full rounded-md border border-line bg-canvas px-3 py-2 text-ink outline-none focus:border-accent"
          data-testid="capture-input"
          [placeholder]="'capture.placeholder' | transloco"
          [attr.aria-label]="'capture.title' | transloco"
          [value]="text()"
          (input)="onInput($event)"
          (keydown.enter)="save()"
          (keydown.escape)="closed.emit()"
        />
        @if (error(); as key) {
          <p class="mt-2 text-sm text-warn" role="alert" data-testid="capture-error">
            {{ key | transloco }}
          </p>
        }
        <p class="mt-2 text-xs text-muted">{{ 'capture.hint' | transloco }}</p>
      </div>
    </div>
  `,
})
export class CapturePanel {
  private readonly inbox = inject(InboxStore);
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  readonly closed = output<void>();
  protected readonly text = signal('');
  protected readonly error = signal<string | null>(null);

  constructor() {
    queueMicrotask(() => this.focus());
  }

  focus(): void {
    this.field().nativeElement.focus();
  }

  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLInputElement).value);
    this.error.set(null);
  }

  async save(): Promise<void> {
    let failure: CaptureError | null;
    try {
      failure = await this.inbox.capture(this.text());
    } catch {
      this.error.set('capture.failed');
      return;
    }
    if (failure) {
      this.error.set(ERROR_KEYS[failure]);
      return;
    }
    this.text.set('');
    this.error.set(null);
    this.field().nativeElement.value = '';
    this.focus();
  }
}
