import { Component, input, model } from '@angular/core';

export interface TabItem {
  id: string;
  label: string;
  /** Shown as "label · count"; 0 is shown too. */
  count?: number;
}

/** Segmented control such as "Todos · 4"; the active tab is highlighted. */
@Component({
  selector: 'app-segmented-tabs',
  template: `
    <div role="tablist" class="inline-flex rounded-lg border border-line bg-surface p-0.5">
      @for (tab of tabs(); track tab.id) {
        <button
          type="button"
          role="tab"
          class="rounded-md px-3 py-1 text-sm"
          [class]="tab.id === selected() ? 'bg-accent text-accent-ink font-medium' : 'text-muted'"
          [attr.aria-selected]="tab.id === selected()"
          [attr.data-testid]="'tab-' + tab.id"
          (click)="selected.set(tab.id)"
        >
          {{ tab.label }}
          @if (tab.count !== undefined) {
            · {{ tab.count }}
          }
        </button>
      }
    </div>
  `,
})
export class SegmentedTabs {
  readonly tabs = input.required<TabItem[]>();
  readonly selected = model<string>('');
}
