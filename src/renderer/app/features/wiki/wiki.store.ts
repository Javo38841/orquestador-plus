import { computed, inject, Injectable, signal } from '@angular/core';
import { ATTACHMENT_MAX_BYTES, type AttachmentResult } from '../../../../shared/attachments';
import {
  buildWikiTree,
  joinSection,
  linkTargets,
  sectionTrail,
  validateNoteInput,
  validateSectionInput,
  type Note,
  type NoteError,
  type NoteInput,
  type NoteSummary,
  type SectionError,
  type SectionSummary,
  type SkippedFile,
  type WikiSection,
} from '../../../../shared/wiki';
import { DESKTOP_API } from '../../core/desktop-api';

/** Paths of every folder of the tree, at any depth. */
function sectionNames(sections: WikiSection[]): string[] {
  return sections.flatMap((s) => [s.name, ...sectionNames(s.sections)]);
}

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
  /** Titles of the folders above the open note, outermost first; empty for a note in the root. */
  readonly currentTrail = computed(() => sectionTrail(this.tree(), this.open()?.section));
  /** Files of `wiki/` that could not be loaded, with the reason. */
  readonly skipped = this.omitted.asReadonly();
  /** True when the open note's file was deleted or renamed outside the app. */
  readonly gone = this.missing.asReadonly();
  /** The note shown in the reading view. */
  readonly current = this.open.asReadonly();
  /** Note each `[[link]]` key points to (a title, or a folder path to tell equal titles apart); missing = pending. */
  readonly slugByKey = computed(() => linkTargets(this.list()));

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

  /**
   * Creates an empty section, inside `parent` when given; a name already used in that folder is rejected.
   * Resolves to the error, or null on success.
   */
  async createSection(title: string, parent?: string): Promise<SectionError | null> {
    const checked = validateSectionInput({ title, ...(parent !== undefined && { parent }) });
    if (!checked.ok) return checked.error;
    const key = joinSection(checked.parent, checked.title).toLowerCase();
    if (sectionNames(this.tree().sections).some((n) => n.toLowerCase() === key)) return 'duplicate';
    if (!this.api) return null;
    const result = await this.api.createSection({
      title: checked.title,
      ...(checked.parent !== undefined && { parent: checked.parent }),
    });
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

  /**
   * Moves a page, with its attachments, to another section (`null` = the root). The open page stays open
   * under its new path. Resolves to the error, or null on success; on error nothing changes.
   */
  async move(slug: string, section: string | null): Promise<NoteError | null> {
    if (!this.api) return null;
    const result = await this.api.moveNote(slug, section);
    if (!result.ok) return result.error;
    if (this.open()?.slug === slug) this.open.set(result.note);
    await this.load();
    return null;
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
