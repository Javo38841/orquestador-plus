import { Component, computed, inject, input } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { dueLabel } from '../../../../shared/today';

const shortDate = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });

/**
 * Due date as text: overdue in amber, today in the normal text color, anything else
 * (future or completed task) in gray. Renders nothing for a null date.
 */
@Component({
  selector: 'app-relative-date',
  template: `@if (view(); as v) {
    <span [class]="v.classes" data-testid="relative-date">{{ v.text }}</span>
  }`,
})
export class RelativeDate {
  private readonly transloco = inject(TranslocoService);

  /** ISO date `YYYY-MM-DD`. */
  readonly date = input<string | null>(null);
  readonly done = input(false);
  readonly now = input<Date>();

  protected readonly view = computed(() => {
    const date = this.date();
    if (date === null) return null;
    const format = () => shortDate.format(new Date(`${date}T00:00:00`));
    if (this.done()) return { text: format(), classes: 'text-muted' };
    const label = dueLabel(date, this.now());
    if (!label) return { text: format(), classes: 'text-muted' };
    if (label.kind === 'today') {
      return { text: this.transloco.translate('ui.date.today'), classes: 'text-ink' };
    }
    const text =
      label.kind === 'yesterday'
        ? this.transloco.translate('ui.date.overdueYesterday')
        : this.transloco.translate('ui.date.overdueDaysAgo', { days: label.days });
    return { text, classes: 'text-warn' };
  });
}
