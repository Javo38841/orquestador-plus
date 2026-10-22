import { Component, input, output } from '@angular/core';

/** Accent-colored action button with an optional leading icon, e.g. "+ Nueva tarea". */
@Component({
  selector: 'app-primary-button',
  template: `
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink"
      data-testid="primary-button"
      (click)="pressed.emit()"
    >
      @if (icon()) {
        <span aria-hidden="true">{{ icon() }}</span>
      }
      {{ label() }}
    </button>
  `,
})
export class PrimaryButton {
  readonly label = input.required<string>();
  readonly icon = input('');
  readonly pressed = output<void>();
}
