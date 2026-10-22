import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CHIP_BASE, CHIP_VARIANTS } from './chip-styles';

/** Project name in blue; a loose task (no project) shows "Suelta" in gray. */
@Component({
  selector: 'app-project-chip',
  imports: [TranslocoPipe],
  template: `<span [class]="classes()" data-testid="project-chip">{{
    name() ?? ('ui.loose' | transloco)
  }}</span>`,
})
export class ProjectChip {
  readonly name = input<string | null>(null);
  protected readonly classes = computed(
    () => `${CHIP_BASE} ${CHIP_VARIANTS[this.name() === null ? 'neutral' : 'project'].classes}`,
  );
}
