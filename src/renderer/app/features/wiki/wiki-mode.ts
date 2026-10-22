import { computed, inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

const WIKI_URL = /^\/wiki(?:[/?#]|$)/;
const DEFAULT_RETURN_URL = '/today';

/**
 * Documentation mode (RF-08): while the Wiki route is open the app drops its own sidebar and
 * the Wiki shows full screen. Remembers the screen it was entered from, to go back with Esc.
 */
@Injectable({ providedIn: 'root' })
export class WikiMode {
  private readonly router = inject(Router);
  private readonly url = signal(this.router.url);
  private returnUrl = DEFAULT_RETURN_URL;

  /** True while the Wiki screen is the current route. */
  readonly active = computed(() => WIKI_URL.test(this.url()));

  constructor() {
    this.router.events.subscribe((event) => {
      if (!(event instanceof NavigationEnd)) return;
      const next = event.urlAfterRedirects;
      if (!WIKI_URL.test(next)) this.returnUrl = next;
      this.url.set(next);
    });
  }

  /** Goes back to the screen the Wiki was entered from. */
  exit(): void {
    void this.router.navigateByUrl(this.returnUrl);
  }
}
