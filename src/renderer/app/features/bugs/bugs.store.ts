import { computed, inject, Injectable, signal } from '@angular/core';
import {
  countOpenBugs,
  validateBugInput,
  type Bug,
  type BugError,
  type BugInput,
  type BugStatus,
} from '../../../../shared/bugs';
import { DESKTOP_API } from '../../core/desktop-api';

@Injectable({ providedIn: 'root' })
export class BugsStore {
  private readonly api = inject(DESKTOP_API);
  private readonly list = signal<Bug[]>([]);

  readonly bugs = this.list.asReadonly();
  /** Bugs still being worked on (new or in analysis); shown in the sidebar. */
  readonly openCount = computed(() => countOpenBugs(this.list()));

  async load(): Promise<void> {
    if (!this.api) return;
    this.list.set(await this.api.listBugs());
  }

  /** Validates locally, saves through the API and puts the new bug first. */
  async create(input: BugInput): Promise<BugError | null> {
    const checked = validateBugInput(input);
    if (!checked.ok) return checked.error;
    if (!this.api) return null;
    const result = await this.api.createBug(input);
    if (!result.ok) return result.error;
    this.list.update((bugs) => [result.bug, ...bugs]);
    return null;
  }

  async update(id: number, input: BugInput): Promise<BugError | null> {
    const checked = validateBugInput(input);
    if (!checked.ok) return checked.error;
    if (!this.api) return null;
    const result = await this.api.updateBug(id, input);
    if (!result.ok) return this.fail(result.error);
    this.replace(result.bug);
    return null;
  }

  async setStatus(id: number, status: BugStatus): Promise<BugError | null> {
    if (!this.api) return null;
    const result = await this.api.setBugStatus(id, status);
    if (!result.ok) return this.fail(result.error);
    this.replace(result.bug);
    return null;
  }

  async remove(id: number): Promise<void> {
    if (!this.api) return;
    if (await this.api.deleteBug(id)) {
      this.list.update((bugs) => bugs.filter((b) => b.id !== id));
    }
  }

  private replace(bug: Bug): void {
    this.list.update((bugs) => bugs.map((b) => (b.id === bug.id ? bug : b)));
  }

  /** A bug that vanished underneath us is dropped from the list. */
  private fail(error: BugError): BugError {
    if (error === 'not_found') void this.load();
    return error;
  }
}
