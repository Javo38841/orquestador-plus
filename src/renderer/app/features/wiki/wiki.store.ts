import { computed, inject, Injectable, signal } from '@angular/core';
import {
  noteKey,
  validateNoteInput,
  type Note,
  type NoteError,
  type NoteInput,
  type NoteSummary,
} from '../../../../shared/wiki';
import { DESKTOP_API } from '../../core/desktop-api';

@Injectable({ providedIn: 'root' })
export class WikiStore {
  private readonly api = inject(DESKTOP_API);
  private readonly list = signal<NoteSummary[]>([]);
  private readonly open = signal<Note | null>(null);

  readonly notes = this.list.asReadonly();
  /** The note shown in the reading view. */
  readonly current = this.open.asReadonly();
  /** File name of the note each normalized title points to; missing = pending link. */
  readonly slugByKey = computed(
    () => new Map(this.list().map((n) => [noteKey(n.title), n.slug] as const)),
  );

  async load(): Promise<void> {
    if (!this.api) return;
    this.list.set(await this.api.listNotes());
  }

  async openNote(slug: string): Promise<NoteError | null> {
    if (!this.api) return null;
    const result = await this.api.getNote(slug);
    if (!result.ok) {
      this.open.set(null);
      await this.load();
      return result.error;
    }
    this.open.set(result.note);
    return null;
  }

  close(): void {
    this.open.set(null);
  }

  /** Validates locally, creates the note and opens it. Returns the error, if any. */
  async create(input: NoteInput): Promise<NoteError | null> {
    const checked = validateNoteInput(input);
    if (!checked.ok) return checked.error;
    if (!this.api) return null;
    const result = await this.api.createNote({ title: checked.title, content: checked.content });
    if (!result.ok) return result.error;
    this.open.set(result.note);
    await this.load();
    return null;
  }

  /** Saves the open note; a changed title renames it. Links to it are refreshed. */
  async save(slug: string, input: NoteInput): Promise<NoteError | null> {
    const checked = validateNoteInput(input);
    if (!checked.ok) return checked.error;
    if (!this.api) return null;
    const result = await this.api.updateNote(slug, {
      title: checked.title,
      content: checked.content,
    });
    if (!result.ok) return result.error;
    this.open.set(result.note);
    await this.load();
    return null;
  }

  async remove(slug: string): Promise<void> {
    if (!this.api) return;
    await this.api.deleteNote(slug);
    this.open.set(null);
    await this.load();
  }
}
