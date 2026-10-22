import { computed, inject, Injectable, signal } from '@angular/core';
import {
  countSnippetsByType,
  snippetTags,
  validateSnippetInput,
  type Snippet,
  type SnippetError,
  type SnippetInput,
  type SnippetsView,
} from '../../../../shared/snippets';
import { DESKTOP_API } from '../../core/desktop-api';

@Injectable({ providedIn: 'root' })
export class SnippetsStore {
  private readonly api = inject(DESKTOP_API);
  private readonly list = signal<Snippet[]>([]);

  readonly snippets = this.list.asReadonly();
  /** Tags used by at least one snippet, for the filter and the suggestions. */
  readonly tags = computed(() => snippetTags(this.list()));

  /** How many snippets each type filter lists, over all of them (CP-13-20). */
  readonly counts = computed(() => countSnippetsByType(this.list()));

  private readonly layout = signal<SnippetsView>('grid');
  /** Grid or list; restored from the saved preference by `load` (CP-13-15). */
  readonly view = this.layout.asReadonly();

  async load(): Promise<void> {
    if (!this.api) return;
    const listing = this.api.listSnippets();
    const saved = this.api.getSnippetsView();
    this.list.set(await listing);
    this.layout.set(await saved);
  }

  /** Switches the layout at once and saves it. */
  async setView(view: SnippetsView): Promise<void> {
    this.layout.set(view);
    await this.api?.setSnippetsView(view);
  }

  /** Validates locally, saves through the API and puts the new snippet first. */
  async create(input: SnippetInput): Promise<SnippetError | null> {
    const checked = validateSnippetInput(input);
    if (!checked.ok) return checked.error;
    if (!this.api) return null;
    const result = await this.api.createSnippet(input);
    if (!result.ok) return result.error;
    this.list.update((snippets) => [result.snippet, ...snippets]);
    return null;
  }

  async update(id: number, input: SnippetInput): Promise<SnippetError | null> {
    const checked = validateSnippetInput(input);
    if (!checked.ok) return checked.error;
    if (!this.api) return null;
    const result = await this.api.updateSnippet(id, input);
    if (!result.ok) {
      // A snippet that vanished underneath us is dropped from the list.
      if (result.error === 'not_found') void this.load();
      return result.error;
    }
    this.list.update((snippets) => snippets.map((s) => (s.id === id ? result.snippet : s)));
    return null;
  }

  async remove(id: number): Promise<void> {
    if (!this.api) return;
    if (await this.api.deleteSnippet(id)) {
      this.list.update((snippets) => snippets.filter((s) => s.id !== id));
    }
  }

  /** Sends the exact content to the clipboard through the preload. */
  async copy(snippet: Snippet): Promise<boolean> {
    if (!this.api) return false;
    return this.api.copyToClipboard(snippet.content);
  }
}
