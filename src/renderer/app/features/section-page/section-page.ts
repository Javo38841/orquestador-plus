import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** Placeholder for sections that have no story implemented yet. */
@Component({
  selector: 'app-section-page',
  imports: [TranslocoPipe],
  template: `
    <header class="mb-8">
      <h1 class="text-2xl font-semibold">{{ titleKey() | transloco }}</h1>
      <p class="mt-1 text-sm text-muted">{{ subtitleKey() | transloco }}</p>
    </header>
    <p class="rounded-lg border border-line bg-surface px-5 py-4 text-sm text-muted">
      {{ 'pages.comingSoon' | transloco }}
    </p>
  `,
})
export class SectionPage {
  /** Bound from route data. */
  readonly titleKey = input.required<string>();
  readonly subtitleKey = input.required<string>();
}
