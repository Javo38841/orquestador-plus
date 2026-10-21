import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { parseMarkdown } from '../../../../shared/wiki';

/** Renders note Markdown as elements (never as HTML). `[[links]]` are buttons or pending marks. */
@Component({
  selector: 'app-note-body',
  imports: [TranslocoPipe, NgTemplateOutlet],
  template: `
    <div class="space-y-3 leading-relaxed" data-testid="note-body">
      @for (block of blocks(); track $index) {
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
            <pre
              class="overflow-x-auto rounded-md border border-line bg-canvas p-3 text-sm"
            ><code>{{ block.text }}</code></pre>
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
        }
      }
    </div>
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
  readonly openLink = output<string>();
  protected readonly blocks = computed(() => parseMarkdown(this.content()));
}
