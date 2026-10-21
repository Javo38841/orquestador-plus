import { Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  RECURRENCE_KINDS,
  validateRecurrence,
  type RecurrenceError,
  type RecurrenceKind,
  type RecurrenceRule,
} from '../../../../shared/recurrence';

/** What the form holds while editing; weekday and day stay strings as typed. */
export interface RecurrenceDraft {
  kind: RecurrenceKind;
  weekday: string;
  monthDay: string;
}

export const EMPTY_RECURRENCE: RecurrenceDraft = { kind: 'once', weekday: '', monthDay: '' };

export const RECURRENCE_ERROR_KEYS: Record<RecurrenceError, string> = {
  invalid_recurrence: 'recurrence.errors.invalid',
  recurrence_weekday: 'recurrence.errors.weekday',
  recurrence_month_day: 'recurrence.errors.monthDay',
  recurrence_due_required: 'recurrence.errors.dueRequired',
};

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

export function draftFromRule(rule: RecurrenceRule): RecurrenceDraft {
  switch (rule.kind) {
    case 'weekly':
      return { kind: 'weekly', weekday: String(rule.weekday), monthDay: '' };
    case 'monthly':
      return { kind: 'monthly', weekday: '', monthDay: String(rule.monthDay) };
    default:
      return { ...EMPTY_RECURRENCE, kind: rule.kind };
  }
}

/** Builds the rule the IPC payload carries; invalid values are left for validation to reject. */
export function ruleFromDraft(draft: RecurrenceDraft): RecurrenceRule {
  switch (draft.kind) {
    case 'weekly':
      return { kind: 'weekly', weekday: draft.weekday === '' ? NaN : Number(draft.weekday) };
    case 'monthly':
      return { kind: 'monthly', monthDay: draft.monthDay === '' ? NaN : Number(draft.monthDay) };
    default:
      return { kind: draft.kind };
  }
}

/** Error of the draft's rule, or null when it is valid. */
export function draftError(draft: RecurrenceDraft): RecurrenceError | null {
  const checked = validateRecurrence(ruleFromDraft(draft));
  return checked.ok ? null : checked.error;
}

/** Repetition picker (RF-06): shows only the fields that apply to the chosen kind. */
@Component({
  selector: 'app-recurrence-editor',
  imports: [TranslocoPipe],
  template: `
    <div class="flex flex-wrap gap-3">
      <label class="block text-sm">
        <span class="text-muted">{{ 'recurrence.label' | transloco }}</span>
        <select
          class="mt-1 block rounded-md border border-line bg-canvas px-3 py-2 text-ink"
          data-testid="recurrence-kind"
          [value]="value().kind"
          (change)="patch({ kind: $any($event.target).value })"
        >
          @for (kind of kinds; track kind) {
            <option [value]="kind" [selected]="value().kind === kind">
              {{ 'recurrence.kinds.' + kind | transloco }}
            </option>
          }
        </select>
      </label>
      @if (value().kind === 'weekly') {
        <label class="block text-sm">
          <span class="text-muted">{{ 'recurrence.weekday' | transloco }}</span>
          <select
            class="mt-1 block rounded-md border border-line bg-canvas px-3 py-2 text-ink"
            data-testid="recurrence-weekday"
            [value]="value().weekday"
            (change)="patch({ weekday: $any($event.target).value })"
          >
            <option value="">{{ 'recurrence.chooseDay' | transloco }}</option>
            @for (day of weekdays; track day) {
              <option [value]="day" [selected]="value().weekday === '' + day">
                {{ 'recurrence.weekdays.' + day | transloco }}
              </option>
            }
          </select>
        </label>
      }
      @if (value().kind === 'monthly') {
        <label class="block text-sm">
          <span class="text-muted">{{ 'recurrence.monthDay' | transloco }}</span>
          <input
            type="number"
            min="1"
            max="31"
            class="mt-1 block w-24 rounded-md border border-line bg-canvas px-3 py-2 text-ink outline-none focus:border-accent"
            data-testid="recurrence-month-day"
            [value]="value().monthDay"
            (input)="patch({ monthDay: $any($event.target).value })"
          />
        </label>
      }
    </div>
  `,
})
export class RecurrenceEditor {
  readonly value = input.required<RecurrenceDraft>();
  readonly valueChange = output<RecurrenceDraft>();
  protected readonly kinds = RECURRENCE_KINDS;
  protected readonly weekdays = WEEKDAYS;

  protected patch(change: Partial<RecurrenceDraft>): void {
    this.valueChange.emit({ ...this.value(), ...change });
  }
}
