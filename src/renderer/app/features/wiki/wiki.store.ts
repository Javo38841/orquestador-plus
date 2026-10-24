import { computed, inject, Injectable, signal } from '@angular/core';
import { ATTACHMENT_MAX_BYTES, type AttachmentResult } from '../../../../shared/attachments';
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
  type SkippedFile,
} from '../../../../shared/wiki';
import { DESKTOP_API } from '../../core/desktop-api';

@Injectable({ providedIn: 'root' })
export class WikiStore {
  private readonly api = inject(DESKTOP_API);
  private readonly list = signal<NoteSummary[]>([]);
  private readonly folders = signal<SectionSummary[]>([]);
  private readonly open = signal<Note | null>(null);
  private readonly missing = signal(false);
  private readonly omitted = signal<SkippedFile[]>([]);

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
  /** Files of `wiki/` that could not be loaded, with the reason. */
  readonly skipped = this.omitted.asReadonly();
  /** True when the open note's file was deleted or renamed outside the app. */
  readonly gone = this.missing.asReadonly();
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
    this.omitted.set(await this.api.listSkippedFiles());
  }

  /**
   * Follows changes made to `wiki/` outside the app: reloads the sidebar and the open note if its file
   * changed. While `isEditing()` the open note is kept as the edit started, so saving still detects the
   * change as a conflict. Returns the function that stops listening.
   */
  watchExternalChanges(isEditing: () => boolean): () => void {
    if (!this.api) return () => undefined;
    return this.api.onWikiChanged(() => void this.refreshAfterExternalChange(isEditing()));
  }

  private async refreshAfterExternalChange(editing: boolean): Promise<void> {
    try {
      // The open page first, so by the time the sidebar shows the change the page is up to date too.
      const note = this.open();
      if (note) {
        const result = await this.api!.getNote(note.slug);
        this.missing.set(!result.ok);
        if (result.ok && !editing && result.note.hash !== note.hash) this.open.set(result.note);
      }
      await this.load();
    } catch {
      // the next change notification retries
    }
  }

  /** Opens `wiki/` in the system file explorer. */
  async openFolder(): Promise<boolean> {
    return this.api ? this.api.openWikiFolder() : false;
  }

  async openNote(slug: string): Promise<NoteError | null> {
    if (!this.api) return null;
    const result = await this.api.getNote(slug);
    if (!result.ok) {
      this.open.set(null);
      this.missing.set(false);
      await this.load();
      return result.error;
    }
    this.missing.set(false);
    this.open.set(result.note);
    return null;
  }

  close(): void {
    this.open.set(null);
    this.missing.set(false);
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

  /**
   * Saves the open note; a changed title renames it. Links to it are refreshed. Sends the hash the edit
   * started from, so a file changed outside the app comes back as `conflict` unless `overwrite`.
   */
  async save(slug: string, input: NoteInput, overwrite = false): Promise<NoteError | null> {
    const checked = validateNoteInput(input);
    if (!checked.ok) return checked.error;
    if (!this.api) return null;
    const expectedHash = this.open()?.slug === slug ? this.open()?.hash : undefined;
    const result = await this.api.updateNote(slug, {
      title: checked.title,
      content: checked.content,
      ...(expectedHash !== undefined && { expectedHash }),
      ...(overwrite && { overwrite }),
    });
    if (!result.ok) return result.error;
    this.missing.set(false);
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

  /**
   * Attaches a file to a saved note and returns the Markdown link to insert. An empty or oversized file is
   * refused here, before it crosses to main.
   */
  async attach(slug: string, name: string, data: Uint8Array): Promise<AttachmentResult> {
    if (data.byteLength === 0) return { ok: false, error: 'empty' };
    if (data.byteLength > ATTACHMENT_MAX_BYTES) return { ok: false, error: 'too_large' };
    if (!this.api) return { ok: false, error: 'io' };
    const result = await this.api.attachFile({ slug, name, data });
    // The note now has one more file: the open note's count is what decides whether delete asks.
    const open = this.open();
    if (result.ok && open?.slug === slug) {
      this.open.set({ ...open, attachments: (open.attachments ?? 0) + 1 });
    }
    return result;
  }

  /** Deletes the note; `deleteAttachments` also removes its `.assets` folder, otherwise it is kept. */
  async remove(slug: string, deleteAttachments = false): Promise<void> {
    if (!this.api) return;
    if (deleteAttachments) await this.api.deleteNote(slug, true);
    else await this.api.deleteNote(slug);
    this.open.set(null);
    this.missing.set(false);
    await this.load();
  }
}
