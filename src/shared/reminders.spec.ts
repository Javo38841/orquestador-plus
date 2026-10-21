import { describe, expect, it } from 'vitest';
import { isValidReminder, reminderInstant, validateReminder } from './reminders';

describe('reminders', () => {
  it('CP-18-02: accepts only real local dates and times', () => {
    expect(isValidReminder('2026-03-10T09:00')).toBe(true);
    expect(isValidReminder('2026-03-10T23:59:59')).toBe(true);
    expect(isValidReminder('2028-02-29T00:00')).toBe(true);
    for (const bad of ['2027-02-29T10:00', '2026-03-10T24:00', '2026-03-10', 'x', null, 5]) {
      expect(isValidReminder(bad)).toBe(false);
    }
  });

  it('treats empty values as no reminder', () => {
    for (const empty of [undefined, null, '']) {
      expect(validateReminder(empty)).toEqual({ ok: true, reminderAt: null });
    }
    expect(validateReminder('nope')).toEqual({ ok: false, error: 'invalid_reminder' });
  });

  it('reads the reminder in local time', () => {
    expect(reminderInstant('2026-03-10T09:30').getTime()).toBe(
      new Date(2026, 2, 10, 9, 30, 0).getTime(),
    );
  });
});
