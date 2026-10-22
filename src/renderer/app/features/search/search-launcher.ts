import { Injectable, signal } from '@angular/core';

/** Whether the global search palette (Ctrl K) is open, so any screen can open it. */
@Injectable({ providedIn: 'root' })
export class SearchLauncher {
  readonly open = signal(false);
}
