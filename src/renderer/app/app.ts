import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AppInfoStore } from './core/app-info.store';
import { CapturePanel } from './features/capture/capture-panel';
import { BugsStore } from './features/bugs/bugs.store';
import { InboxStore } from './features/inbox/inbox.store';
import { SearchPalette } from './features/search/search-palette';
import { NAVIGATION } from './layout/navigation';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoPipe, CapturePanel, SearchPalette],
  templateUrl: './app.html',
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class App {
  protected readonly store = inject(AppInfoStore);
  protected readonly inbox = inject(InboxStore);
  protected readonly bugs = inject(BugsStore);
  protected readonly navigation = NAVIGATION;
  protected readonly captureOpen = signal(false);
  protected readonly searchOpen = signal(false);

  /** Ctrl+Space opens quick capture from any section (RF-01). */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey && (event.code === 'Space' || event.key === ' ')) {
      event.preventDefault();
      this.captureOpen.set(true);
    } else if (
      event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === 'k'
    ) {
      // Ctrl+K opens the global search; it does not clash with Ctrl+Space (quick capture).
      event.preventDefault();
      this.captureOpen.set(false);
      this.searchOpen.set(true);
    }
  }
}
