import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { BugSeverity } from '../../../../shared/bugs';
import { CHIP_BASE, CHIP_VARIANTS, type ChipVariant } from './chip-styles';

export const SEVERITY_VARIANTS: Record<BugSeverity, ChipVariant> = {
  high: 'danger',
  medium: 'warn',
  low: 'project',
};

/** Bug severity: high red, medium amber, low blue. */
@Component({
  selector: 'app-severity-badge',
  imports: [TranslocoPipe],
  template: `<span [class]="classes()" data-testid="severity-badge">{{
    'bugs.severity.' + severity() | transloco
  }}</span>`,
})
export class SeverityBadge {
  readonly severity = input.required<BugSeverity>();
  protected readonly classes = computed(
    () => `${CHIP_BASE} ${CHIP_VARIANTS[SEVERITY_VARIANTS[this.severity()]].classes}`,
  );
}
