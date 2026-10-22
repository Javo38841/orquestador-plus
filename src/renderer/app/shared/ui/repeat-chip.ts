import { Component, input } from '@angular/core';
import { CHIP_BASE, CHIP_VARIANTS } from './chip-styles';

/** Recurrence label such as "Semanal · domingo", with the ↻ icon, in violet. */
@Component({
  selector: 'app-repeat-chip',
  template: `<span [class]="classes" data-testid="repeat-chip"
    ><span aria-hidden="true">↻</span> {{ label() }}</span
  >`,
})
export class RepeatChip {
  readonly label = input.required<string>();
  protected readonly classes = `${CHIP_BASE} ${CHIP_VARIANTS.repeat.classes}`;
}
