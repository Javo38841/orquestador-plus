import { Component, input } from '@angular/core';
import { CHIP_BASE, CHIP_VARIANTS } from './chip-styles';

/** Where an item came from (e.g. "Portal"), in amber. The caller passes the translated text. */
@Component({
  selector: 'app-origin-badge',
  template: `<span [class]="classes" data-testid="origin-badge">{{ label() }}</span>`,
})
export class OriginBadge {
  readonly label = input.required<string>();
  protected readonly classes = `${CHIP_BASE} ${CHIP_VARIANTS.warn.classes}`;
}
