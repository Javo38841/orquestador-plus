import { Component, input } from '@angular/core';
import { CHIP_BASE, CHIP_VARIANTS } from './chip-styles';

/** `#tag` in gray monospace. */
@Component({
  selector: 'app-tag-chip',
  template: `<span [class]="classes" data-testid="tag-chip">#{{ tag() }}</span>`,
})
export class TagChip {
  readonly tag = input.required<string>();
  protected readonly classes = `${CHIP_BASE} font-mono ${CHIP_VARIANTS.neutral.classes}`;
}
