import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { SnippetType } from '../../../../shared/snippets';
import { CHIP_BASE, CHIP_VARIANTS, type ChipVariant } from './chip-styles';

export const SNIPPET_TYPE_VARIANTS: Record<SnippetType, ChipVariant> = {
  sql: 'project',
  command: 'repeat',
};

/** Snippet type: SQL blue, command violet. */
@Component({
  selector: 'app-snippet-type-badge',
  imports: [TranslocoPipe],
  template: `<span [class]="classes()" data-testid="snippet-type-badge">{{
    'snippets.types.' + type() | transloco
  }}</span>`,
})
export class SnippetTypeBadge {
  readonly type = input.required<SnippetType>();
  protected readonly classes = computed(
    () => `${CHIP_BASE} ${CHIP_VARIANTS[SNIPPET_TYPE_VARIANTS[this.type()]].classes}`,
  );
}
