import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { BugStatus } from '../../../../shared/bugs';
import { CHIP_BASE, CHIP_VARIANTS, type ChipVariant } from './chip-styles';

export const BUG_STATUS_VARIANTS: Record<BugStatus, ChipVariant> = {
  new: 'project',
  analysis: 'warn',
  resolved: 'success',
  verified: 'repeat',
};

/** Bug status, one color per state. */
@Component({
  selector: 'app-bug-status-badge',
  imports: [TranslocoPipe],
  template: `<span [class]="classes()" data-testid="bug-status-badge">{{
    'bugs.status.' + status() | transloco
  }}</span>`,
})
export class BugStatusBadge {
  readonly status = input.required<BugStatus>();
  protected readonly classes = computed(
    () => `${CHIP_BASE} ${CHIP_VARIANTS[BUG_STATUS_VARIANTS[this.status()]].classes}`,
  );
}
