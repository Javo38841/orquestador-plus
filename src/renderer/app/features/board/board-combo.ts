import {
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  input,
  model,
  signal,
} from '@angular/core';

export interface ComboOption {
  value: string;
  label: string;
}

/**
 * Combo box in the design's style: a button that opens a listbox, with the chosen option
 * highlighted in teal and exposed through `aria-selected`. Fully operable with the keyboard.
 */
@Component({
  selector: 'app-board-combo',
  template: `
    <div class="relative inline-block">
      <button
        type="button"
        class="flex min-w-40 items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink hover:border-accent focus-visible:border-accent"
        aria-haspopup="listbox"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="label() + ': ' + currentLabel()"
        [attr.data-testid]="testid()"
        [attr.data-value]="value()"
        (click)="toggle()"
        (keydown.arrowdown)="openList($event)"
        (keydown.arrowup)="openList($event)"
      >
        <span>{{ currentLabel() }}</span>
        <span aria-hidden="true" class="text-muted">▾</span>
      </button>
      @if (open()) {
        <ul
          role="listbox"
          class="absolute z-20 mt-1 max-h-64 min-w-full overflow-y-auto rounded-lg border border-line bg-surface-raised p-1 shadow-lg"
          [attr.aria-label]="label()"
        >
          @for (option of options(); track option.value) {
            <li
              role="option"
              tabindex="-1"
              class="cursor-pointer rounded-md px-3 py-1.5 text-sm outline-none hover:bg-line focus:bg-line"
              [class]="
                option.value === value() ? 'bg-accent-soft font-medium text-accent' : 'text-ink'
              "
              [attr.aria-selected]="option.value === value()"
              [attr.data-testid]="testid() + '-option'"
              [attr.data-value]="option.value"
              (click)="pick(option.value)"
              (keydown)="onKey($event)"
            >
              {{ option.label }}
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class BoardCombo {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly options = input.required<ComboOption[]>();
  readonly value = model.required<string>();
  readonly label = input.required<string>();
  readonly testid = input('combo');
  protected readonly open = signal(false);
  protected readonly currentLabel = computed(
    () => this.options().find((o) => o.value === this.value())?.label ?? '',
  );

  protected toggle(): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.openList();
  }

  /** Opens the list and focuses the chosen option (or the first one). */
  protected openList(event?: Event): void {
    event?.preventDefault();
    this.open.set(true);
    setTimeout(() => {
      const items = this.items();
      (items.find((i) => i.getAttribute('aria-selected') === 'true') ?? items[0])?.focus();
    });
  }

  protected pick(value: string): void {
    this.value.set(value);
    this.close();
  }

  protected onKey(event: KeyboardEvent): void {
    const items = this.items();
    const at = items.indexOf(event.target as HTMLElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        items[Math.min(at + 1, items.length - 1)]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        items[Math.max(at - 1, 0)]?.focus();
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (at >= 0) this.pick(this.options()[at].value);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.close();
        break;
      case 'Tab':
        this.open.set(false);
        break;
    }
  }

  @HostListener('document:click', ['$event'])
  protected outside(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node))
      this.open.set(false);
  }

  /** Closes the list and hands focus back to the button. */
  private close(): void {
    this.open.set(false);
    this.host.nativeElement.querySelector<HTMLElement>('button')?.focus();
  }

  private items(): HTMLElement[] {
    return [...this.host.nativeElement.querySelectorAll<HTMLElement>('[role="option"]')];
  }
}
