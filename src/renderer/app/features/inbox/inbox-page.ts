import { Component, inject, OnInit } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { InboxStore } from './inbox.store';
import { relativeTime } from './relative-time';

@Component({
  selector: 'app-inbox-page',
  imports: [TranslocoPipe],
  template: `
    <header class="mb-8">
      <h1 class="text-2xl font-semibold">{{ 'nav.inbox' | transloco }}</h1>
      <p class="mt-1 text-sm text-muted">{{ 'pages.inbox' | transloco }}</p>
    </header>
    @if (store.items().length === 0) {
      <p class="rounded-lg border border-line bg-surface px-5 py-4 text-sm text-muted">
        {{ 'inbox.empty' | transloco }}
      </p>
    } @else {
      <ul class="space-y-2" data-testid="inbox-list">
        @for (item of store.items(); track item.id) {
          <li
            class="flex items-center justify-between gap-4 rounded-lg border border-line bg-surface px-5 py-3"
            data-testid="inbox-item"
          >
            <span class="min-w-0 break-words">{{ item.title }}</span>
            <span class="shrink-0 text-xs text-muted">
              {{ 'inbox.source.' + item.source | transloco }} · {{ time(item.createdAt) }}
            </span>
          </li>
        }
      </ul>
    }
  `,
})
export class InboxPage implements OnInit {
  protected readonly store = inject(InboxStore);

  ngOnInit(): void {
    void this.store.load();
  }

  protected time(iso: string): string {
    return relativeTime(iso);
  }
}
