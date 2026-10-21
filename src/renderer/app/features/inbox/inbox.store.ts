import { computed, inject, Injectable, signal } from '@angular/core';
import { validateCapture, type CaptureError, type InboxItem } from '../../../../shared/inbox';
import { DESKTOP_API } from '../../core/desktop-api';

@Injectable({ providedIn: 'root' })
export class InboxStore {
  private readonly api = inject(DESKTOP_API);
  private readonly list = signal<InboxItem[]>([]);

  readonly items = this.list.asReadonly();
  readonly count = computed(() => this.list().length);

  async load(): Promise<void> {
    if (!this.api) return;
    this.list.set(await this.api.listInbox());
  }

  /** Validates locally, saves through the API and puts the new item first. */
  async capture(text: string): Promise<CaptureError | null> {
    const checked = validateCapture(text);
    if (!checked.ok) return checked.error;
    if (!this.api) return null;

    const result = await this.api.captureInbox(checked.title);
    if (!result.ok) return result.error;
    this.list.update((items) => [result.item, ...items]);
    return null;
  }
}
