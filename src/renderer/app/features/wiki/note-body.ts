import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { SNIPPET_CONTENT_MAX_LENGTH, SNIPPET_TITLE_MAX_LENGTH } from '../../../../shared/snippets';
import { parseMarkdown, type CalloutKind } from '../../../../shared/wiki';
import { SnippetsStore } from '../snippets/snippets.store';

/** Icon and theme-variable classes per callout; written out so Tailwind sees every class. */
const CALLOUT_STYLE: Record<CalloutKind, { icon: string; box: string; label: string }> = {
  note: { icon: 'ℹ', box: 'border-callout-note bg-callout-note/10', label: 'text-callout-note' },
  tip: { icon: '✦', box: 'border-callout-tip bg-callout-tip/10', label: 'text-callout-tip' },
  caution: {
    icon: '⚠',
    box: 'border-callout-caution bg-callout-caution/10',
    label: 'text-callout-caution',
  },
};

/** Renders note Markdown as elements (never as HTML). `[[links]]` are buttons or pending marks. */
@Component({
  selector: 'app-note-body',
  imports: [TranslocoPipe, NgTemplateOutlet],
  template: `
    <div class="space-y-3 leading-relaxed" data-testid="note-body">
      <ng-container
        [ngTemplateOutlet]="blocksTpl"
        [ngTemplateOutletContext]="{ $implicit: blocks(), path: '' }"
      />
    </div>
    <ng-template #blocksTpl let-list let-path="path">
      @for (block of list; track $index) {
        @switch (block.type) {
          @case ('heading') {
            <p
              class="font-semibold"
              [class]="block.level === 1 ? 'text-2xl' : block.level === 2 ? 'text-xl' : 'text-lg'"
            >
              <ng-container
                [ngTemplateOutlet]="inlineTpl"
                [ngTemplateOutletContext]="{ $implicit: block.inline }"
              />
            </p>
          }
          @case ('paragraph') {
            <p>
              <ng-container
                [ngTemplateOutlet]="inlineTpl"
                [ngTemplateOutletContext]="{ $implicit: block.inline }"
              />
            </p>
          }
          @case ('code') {
            <figure class="overflow-hidden rounded-md border border-line bg-canvas">
              @if (block.title) {
                <figcaption
                  class="border-b border-line px-3 py-1 text-xs text-muted"
                  data-testid="code-title"
                >
                  {{ block.title }}
                </figcaption>
              }
              <pre class="overflow-x-auto p-3 text-sm"><code>{{ block.text }}</code></pre>
              @if (block.text.trim() !== '') {
                <div class="flex items-center justify-end gap-2 border-t border-line px-3 py-1">
                  @if (feedback()[path + $index]; as state) {
                    <span
                      class="text-xs"
                      [class]="state === 'saved' ? 'text-accent' : 'text-warn'"
                      [attr.role]="state === 'saved' ? 'status' : 'alert'"
                      data-testid="code-save-feedback"
                      >{{ (state === 'saved' ? 'wiki.code.saved' : state) | transloco }}</span
                    >
                  }
                  <button
                    type="button"
                    class="rounded border border-line px-2 py-0.5 text-xs hover:border-accent"
                    data-testid="code-save-snippet"
                    (click)="saveSnippet(path + $index, block.text, block.lang, block.title)"
                  >
                    {{ 'wiki.code.saveSnippet' | transloco }}
                  </button>
                </div>
              }
            </figure>
          }
          @case ('list') {
            <ul class="space-y-1 pl-5" [class]="block.ordered ? 'list-decimal' : 'list-disc'">
              @for (item of block.items; track $index) {
                <li>
                  <ng-container
                    [ngTemplateOutlet]="inlineTpl"
                    [ngTemplateOutletContext]="{ $implicit: item }"
                  />
                </li>
              }
            </ul>
          }
          @case ('callout') {
            <aside
              class="space-y-2 rounded-md border-l-4 px-4 py-3"
              [class]="callout(block.kind).box"
              [attr.data-kind]="block.kind"
              data-testid="callout"
            >
              <p class="flex items-center gap-2 font-semibold" [class]="callout(block.kind).label">
                <span aria-hidden="true" data-testid="callout-icon">{{
                  callout(block.kind).icon
                }}</span>
                <span data-testid="callout-label">{{
                  block.title || ('wiki.callout.' + block.kind | transloco)
                }}</span>
              </p>
              <div class="space-y-2">
                <ng-container
                  [ngTemplateOutlet]="blocksTpl"
                  [ngTemplateOutletContext]="{ $implicit: block.blocks, path: path + $index + '.' }"
                />
              </div>
            </aside>
          }
          @case ('table') {
            <div class="overflow-x-auto">
              <table class="w-full border-collapse text-sm" data-testid="note-table">
                <thead>
                  <tr>
                    @for (cell of block.header; track $index) {
                      <th
                        class="border border-line bg-surface-raised px-3 py-1.5 font-semibold"
                        [style.text-align]="block.align[$index]"
                      >
                        <ng-container
                          [ngTemplateOutlet]="inlineTpl"
                          [ngTemplateOutletContext]="{ $implicit: cell }"
                        />
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of block.rows; track $index) {
                    <tr>
                      @for (cell of row; track $index) {
                        <td
                          class="border border-line px-3 py-1.5"
                          [style.text-align]="block.align[$index]"
                        >
                          <ng-container
                            [ngTemplateOutlet]="inlineTpl"
                            [ngTemplateOutletContext]="{ $implicit: cell }"
                          />
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      }
    </ng-template>
    <ng-template #inlineTpl let-parts>
      @for (part of parts; track $index) {
        @switch (part.type) {
          @case ('text') {
            {{ part.text }}
          }
          @case ('strong') {
            <strong>{{ part.text }}</strong>
          }
          @case ('code') {
            <code class="rounded bg-canvas px-1 text-sm">{{ part.text }}</code>
          }
          @case ('link') {
            @if (slugs().get(part.key); as slug) {
              <button
                type="button"
                class="text-accent underline"
                data-testid="note-link"
                (click)="openLink.emit(slug)"
              >
                {{ part.label }}
              </button>
            } @else {
              <span
                class="text-warn underline decoration-dotted"
                data-testid="note-link-pending"
                [title]="'wiki.pendingLink' | transloco"
                >{{ part.label }}</span
              >
            }
          }
        }
      }
    </ng-template>
  `,
})
export class NoteBody {
  readonly content = input.required<string>();
  /** Slug by normalized title; a link whose key is missing is pending. */
  readonly slugs = input.required<ReadonlyMap<string, string>>();
  /** Title given to a saved snippet when its code block has none. */
  readonly pageTitle = input('');
  readonly openLink = output<string>();
  private readonly snippets = inject(SnippetsStore);
  protected callout(kind: CalloutKind): (typeof CALLOUT_STYLE)[CalloutKind] {
    return CALLOUT_STYLE[kind];
  }
  /** Per code block: `saved`, or the translation key of the error. */
  protected readonly feedback = signal<Record<string, string>>({});
  protected readonly blocks = computed(() => parseMarkdown(this.content()));

  protected async saveSnippet(
    id: string,
    content: string,
    lang: string | undefined,
    title: string | undefined,
  ): Promise<void> {
    if (content.length > SNIPPET_CONTENT_MAX_LENGTH) return this.report(id, 'wiki.code.tooLong');
    const error = await this.snippets.create({
      title: (title || this.pageTitle()).slice(0, SNIPPET_TITLE_MAX_LENGTH),
      type: lang?.toLowerCase() === 'sql' ? 'sql' : 'command',
      content,
    });
    if (error === null) {
      this.report(id, 'saved');
      setTimeout(
        () =>
          this.feedback.update((all) => {
            const rest = { ...all };
            delete rest[id];
            return rest;
          }),
        2000,
      );
    } else this.report(id, error === 'too_long' ? 'wiki.code.tooLong' : 'wiki.code.failed');
  }

  private report(id: string, state: string): void {
    this.feedback.update((all) => ({ ...all, [id]: state }));
  }
}
