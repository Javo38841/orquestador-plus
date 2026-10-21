import { Component, computed, input, model, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { suggestTags, validateTag, type TagError } from '../../../../shared/tasks';

export const TAG_ERROR_KEYS: Record<TagError, string> = {
  tag_empty: 'tags.errors.empty',
  tag_too_long: 'tags.errors.tooLong',
  tag_spaces: 'tags.errors.spaces',
};

/** Chips plus an input to add tags, with suggestions from the existing ones (RF-07). */
@Component({
  selector: 'app-tags-editor',
  imports: [TranslocoPipe],
  template: `
    <div class="block text-sm">
      <span class="text-muted">{{ 'tags.label' | transloco }}</span>
      <div class="mt-1 flex flex-wrap items-center gap-2">
        @for (tag of tags(); track tag) {
          <span
            class="inline-flex items-center gap-1 rounded-full bg-line px-2 py-0.5 text-xs"
            data-testid="tag-chip"
          >
            #{{ tag }}
            <button
              type="button"
              class="text-muted"
              data-testid="tag-remove"
              [attr.aria-label]="'tags.remove' | transloco"
              (click)="remove(tag)"
            >
              ×
            </button>
          </span>
        }
        <input
          type="text"
          class="rounded-md border border-line bg-canvas px-3 py-1.5 text-ink outline-none focus:border-accent"
          data-testid="tag-input"
          [placeholder]="'tags.placeholder' | transloco"
          [value]="typed()"
          (input)="onInput($any($event.target).value)"
          (keydown)="onKey($event)"
        />
        <button
          type="button"
          class="rounded-md border border-line px-3 py-1.5"
          data-testid="tag-add"
          (click)="add(typed())"
        >
          {{ 'tags.add' | transloco }}
        </button>
      </div>
      @if (suggestions().length > 0) {
        <ul class="mt-2 flex flex-wrap gap-2" data-testid="tag-suggestions">
          @for (s of suggestions(); track s) {
            <li>
              <button
                type="button"
                class="rounded-full border border-line px-2 py-0.5 text-xs text-muted"
                data-testid="tag-suggestion"
                (click)="add(s)"
              >
                #{{ s }}
              </button>
            </li>
          }
        </ul>
      }
      @if (error(); as key) {
        <p class="mt-1 text-sm text-warn" role="alert" data-testid="tag-error">
          {{ key | transloco }}
        </p>
      }
    </div>
  `,
})
export class TagsEditor {
  /** Normalized tags chosen so far. */
  readonly tags = model<string[]>([]);
  /** Existing tags offered as suggestions. */
  readonly known = input<string[]>([]);

  protected readonly typed = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly suggestions = computed(() =>
    suggestTags(this.known(), this.typed(), this.tags()),
  );

  protected onInput(value: string): void {
    this.typed.set(value);
    this.error.set(null);
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.add(this.typed());
    }
  }

  protected remove(tag: string): void {
    this.tags.update((list) => list.filter((t) => t !== tag));
  }

  /** Adds a tag; returns the error key when it is rejected. */
  add(raw: string): string | null {
    const checked = validateTag(raw);
    if (!checked.ok) {
      const key = TAG_ERROR_KEYS[checked.error];
      this.error.set(key);
      return key;
    }
    this.tags.update((list) => (list.includes(checked.tag) ? list : [...list, checked.tag].sort()));
    this.typed.set('');
    this.error.set(null);
    return null;
  }

  /** Commits whatever is typed when saving. Empty input is fine (nothing to add); returns an error key if rejected. */
  flush(): string | null {
    if (this.typed().trim() === '') {
      this.error.set(null);
      return null;
    }
    return this.add(this.typed());
  }
}
