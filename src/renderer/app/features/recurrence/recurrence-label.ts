import type { TranslocoService } from '@jsverse/transloco';
import type { RecurrenceRule } from '../../../../shared/recurrence';

/** Chip text such as "Semanal · viernes"; empty for a task that does not repeat. */
export function recurrenceLabel(transloco: TranslocoService, rule: RecurrenceRule): string {
  switch (rule.kind) {
    case 'once':
      return '';
    case 'daily':
      return transloco.translate('recurrence.chip.daily');
    case 'weekly':
      return transloco.translate('recurrence.chip.weekly', {
        day: transloco.translate(`recurrence.weekdays.${rule.weekday}`),
      });
    case 'monthly':
      return transloco.translate('recurrence.chip.monthly', { day: rule.monthDay });
  }
}
