import { computed, inject, Injectable, signal } from '@angular/core';
import {
  buildWikiTree,
  noteKey,
  validateNoteInput,
  validateSectionInput,
  type Note,
  type NoteError,
  type NoteInput,
  type NoteSummary,
  type SectionError,
  type SectionSummary,
} from '../../../../shared/wiki';
import { DESKTOP_API } from '../../core/desktop-api';

@Injectable({ providedIn: 'root' })
export class WikiStore {
  private readonly api = inject(DESKTOP_API);
  private readonly list = signal<NoteSummary[]>([]);
  private readonly folders = signal<SectionSummary[]>([]);
  private readonly open = signal<Note | null>(null);

  readonly notes = this.list.asReadonly();
  readonly sections = this.folders.asReadonly();
  /** Sidebar tree: loose pages and sections, each in its defined order. */
  readonly tree = computed(() => buildWikiTree(this.list(), this.folders()));
  /** Title of the section the open note belongs to, if any. */
  readonly currentSectionTitle = computed(() => {
    const name = this.open()?.section;
    if (name === undefined) return null;
    return this.folders().find((s) => s.name === name)?.title ?? name;
  });
  /** The note shown in the reading view. */
  readonly current = this.open.asReadonly();
  /** File name of the note each normalized title points to; missing = pending link. */
  readonly slugByKey = computed(
    () => new Map(this.list().map((n) => [noteKey(n.title), n.slug] as const)),
  );

  async load(): Promise<void> {
    if (!this.api) return;
    const [notes, sections] = await Promise.all([this.api.listNotes(), this.api.listSections()]);
    this.list.set(notes);
    this.folders.set(sections);
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

  /** Validates locally, creates the note (in `section`, if given) and opens it. */
  async create(input: NoteInput): Promise<NoteError | null> {
    const checked = validateNoteInput(input);
    if (!checked.ok) return checked.error;
    if (!this.api) return null;
    const result = await this.api.createNote({
      title: checked.title,
      content: checked.content,
      ...(checked.section !== undefined && { section: checked.section }),
    });
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

  /** Creates an empty section; a name already used by another one is rejected. */
  async createSection(title: string): Promise<SectionError | null> {
    const checked = validateSectionInput({ title });
    if (!checked.ok) return checked.error;
    const key = checked.title.toLowerCase();
    if (this.tree().sections.some((s) => s.name.toLowerCase() === key)) return 'duplicate';
    if (!this.api) return null;
    const result = await this.api.createSection({ title: checked.title });
    if (!result.ok) return result.error;
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
