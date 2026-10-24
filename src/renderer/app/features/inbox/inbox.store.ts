import { computed, inject, Injectable, signal } from '@angular/core';
import type { Bug, BugInput } from '../../../../shared/bugs';
import {
  validateCapture,
  validateInboxBug,
  type CaptureError,
  type InboxConversion,
  type InboxConvertError,
  type InboxItem,
} from '../../../../shared/inbox';
import { validateNoteInput, type Note, type NoteInput } from '../../../../shared/wiki';
import { validateTaskInput, type TaskError, type TaskInput } from '../../../../shared/tasks';
import { DESKTOP_API } from '../../core/desktop-api';

/** What an inbox item turned into, or why it did not. The item stays in the inbox on failure. */
export type ConvertOutcome =
  | { ok: true; created: { type: 'bug'; bug: Bug } | { type: 'note'; note: Note } }
  | { ok: false; error: InboxConvertError };

@Injectable({ providedIn: 'root' })
export class InboxStore {
  private readonly api = inject(DESKTOP_API);
  private readonly list = signal<InboxItem[]>([]);

  readonly items = this.list.asReadonly();
  /** Reports that came through the portal and were not classified yet (RF-15). */
  readonly portalItems = computed(() => this.list().filter((i) => i.source === 'portal'));
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

  /** Turns an item into a task. Returns the validation error, if any. */
  async convert(id: number, input: TaskInput): Promise<TaskError | null> {
    const checked = validateTaskInput(input);
    if (!checked.ok) return checked.error;
    if (!this.api) return null;

    const result = await this.api.convertInboxItem(id, { type: 'task', input });
    if (!result.ok) return result.error as TaskError;
    this.list.update((items) => items.filter((i) => i.id !== id));
    return null;
  }

  /** Turns an item into a bug (RF-09). Validates locally first; nothing is sent when the form is invalid. */
  async convertToBug(id: number, input: BugInput): Promise<ConvertOutcome | null> {
    const checked = validateInboxBug(input);
    if (!checked.ok) return { ok: false, error: checked.error };
    return this.send(id, { type: 'bug', input });
  }

  /** Turns an item into a wiki note (RF-08) whose content is the captured text. */
  async convertToNote(
    id: number,
    input: Omit<NoteInput, 'content'>,
  ): Promise<ConvertOutcome | null> {
    const checked = validateNoteInput({ ...input, content: '' });
    if (!checked.ok) return { ok: false, error: checked.error };
    return this.send(id, { type: 'note', input: { ...input, content: '' } });
  }

  private async send(id: number, conversion: InboxConversion): Promise<ConvertOutcome | null> {
    if (!this.api) return null;
    const result = await this.api.convertInboxItem(id, conversion);
    if (!result.ok) return result;
    this.list.update((items) => items.filter((i) => i.id !== id));
    if (result.type === 'bug') return { ok: true, created: { type: 'bug', bug: result.bug } };
    if (result.type === 'note') return { ok: true, created: { type: 'note', note: result.note } };
    return null;
  }

  async discard(id: number): Promise<void> {
    if (!this.api) return;
    if (await this.api.discardInboxItem(id)) {
      this.list.update((items) => items.filter((i) => i.id !== id));
    }
  }
}
