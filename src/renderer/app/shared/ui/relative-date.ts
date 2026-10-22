import { Component, computed, inject, input } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { localDate } from '../../../../shared/tasks';
import { dueLabel } from '../../../../shared/today';

const shortDate = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
const weekdayDate = new Intl.DateTimeFormat('es', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const DAY_MS = 24 * 3600 * 1000;

/** "Vie 23 oct" for this year, "23 oct 2027" for any other. */
function compactDate(date: string, now: Date): string {
  const day = new Date(`${date}T00:00:00`);
  const clean = (text: string) => text.replace(/\.$/, '');
  if (day.getFullYear() !== now.getFullYear()) {
    const text = shortDate
      .formatToParts(day)
      .map((p) => clean(p.value))
      .join('');
    return `${text} ${day.getFullYear()}`;
  }
  const parts = weekdayDate.formatToParts(day);
  const get = (type: string) => clean(parts.find((p) => p.type === type)?.value ?? '');
  const weekday = get('weekday');
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${get('day')} ${get('month')}`;
}

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
  /**
   * Short wording for dense tables: "Ayer", "Hace 2 días", "Mañana", "Vie 23 oct" (with the
   * year when it is not the current one).
   */
  readonly compact = input(false);

  protected readonly view = computed(() => {
    const date = this.date();
    if (date === null) return null;
    const now = this.now() ?? new Date();
    const compact = this.compact();
    const format = () =>
      compact ? compactDate(date, now) : shortDate.format(new Date(`${date}T00:00:00`));
    if (this.done()) return { text: format(), classes: 'text-muted' };
    const label = dueLabel(date, now);
    if (!label && compact && date === localDate(new Date(now.getTime() + DAY_MS))) {
      return { text: this.transloco.translate('ui.date.tomorrow'), classes: 'text-muted' };
    }
    if (!label) return { text: format(), classes: 'text-muted' };
    if (label.kind === 'today') {
      return { text: this.transloco.translate('ui.date.today'), classes: 'text-ink' };
    }
    const prefix = compact ? 'ui.date.compact' : 'ui.date';
    const text =
      label.kind === 'yesterday'
        ? this.transloco.translate(`${prefix}.overdueYesterday`)
        : this.transloco.translate(`${prefix}.overdueDaysAgo`, { days: label.days });
    return { text, classes: 'text-warn' };
  });
}
