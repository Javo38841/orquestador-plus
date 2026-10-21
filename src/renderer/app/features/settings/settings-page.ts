import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ExportStore } from './export.store';

const INCLUDED = ['tasks', 'projects', 'tags', 'inbox', 'wiki'];

/** Ajustes / Exportar (RF-11): what is exported and the button that exports it. */
@Component({
  selector: 'app-settings-page',
  imports: [TranslocoPipe],
  template: `
    <header class="mb-6">
      <h1 class="text-2xl font-semibold">{{ 'nav.settings' | transloco }}</h1>
      <p class="mt-1 text-sm text-muted">{{ 'pages.settings' | transloco }}</p>
    </header>

    <section class="rounded-lg border border-line bg-surface p-4 text-sm">
      <h2 class="mb-2 text-lg font-semibold">{{ 'export.title' | transloco }}</h2>
      <p class="text-muted">{{ 'export.intro' | transloco }}</p>
      <ul class="mt-3 list-disc pl-5" data-testid="export-included">
        @for (key of included; track key) {
          <li>{{ 'export.included.' + key | transloco }}</li>
        }
      </ul>
      <p class="mt-3 text-muted">{{ 'export.format' | transloco }}</p>

      <div class="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="button"
          class="rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink disabled:opacity-60"
          data-testid="export-all"
          [disabled]="store.state().kind === 'running'"
          (click)="store.exportAll()"
        >
          {{ 'export.button' | transloco }}
        </button>
        <p class="flex items-center gap-2 text-xs text-muted" data-testid="export-offline">
          <span class="size-2 rounded-full bg-accent" aria-hidden="true"></span>
          {{ 'app.offline' | transloco }}
        </p>
      </div>

      @switch (store.state().kind) {
        @case ('running') {
          <p class="mt-4 text-muted" role="status">{{ 'export.running' | transloco }}</p>
        }
        @case ('done') {
          <p class="mt-4" role="status" data-testid="export-done">
            {{ 'export.done' | transloco }}
            <span class="font-mono break-all" data-testid="export-path">{{ donePath() }}</span>
          </p>
        }
        @case ('failed') {
          <p class="mt-4 text-warn" role="alert" data-testid="export-failed">
            {{ failedKey() | transloco }}
          </p>
        }
      }
    </section>
  `,
})
export class SettingsPage {
  protected readonly store = inject(ExportStore);
  protected readonly included = INCLUDED;

  protected donePath(): string {
    const state = this.store.state();
    return state.kind === 'done' ? state.path : '';
  }

  protected failedKey(): string {
    const state = this.store.state();
    return state.kind === 'failed' && state.error === 'cancelled'
      ? 'export.cancelled'
      : 'export.failed';
  }
}
