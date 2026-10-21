import { inject, Injectable, signal } from '@angular/core';
import {
  sortJournal,
  validateJournalInput,
  type JournalEntry,
  type JournalError,
} from '../../../../shared/journal';
import { DESKTOP_API } from '../../core/desktop-api';

@Injectable({ providedIn: 'root' })
export class JournalStore {
  private readonly api = inject(DESKTOP_API);
  private readonly list = signal<JournalEntry[]>([]);

  /** Most recent day first. */
  readonly entries = this.list.asReadonly();

  async load(): Promise<void> {
    if (!this.api) return;
    this.list.set(sortJournal(await this.api.listJournal()));
  }

  /** Saves the day's entry; a blank text removes it. Returns the error, if any. */
  async save(date: string, text: string): Promise<JournalError | null> {
    const checked = validateJournalInput(date, text);
    if (!checked.ok) return checked.error;
    if (!this.api) return null;
    const result = await this.api.saveJournalEntry(date, text);
    if (!result.ok) return result.error;
    const { entry } = result;
    this.list.update((entries) => {
      const others = entries.filter((e) => e.date !== date);
      return sortJournal(entry ? [...others, entry] : others);
    });
    return null;
  }
}
