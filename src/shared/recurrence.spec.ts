import { describe, expect, it } from 'vitest';
import { fromRRule, nextDueDate, toRRule, validateRecurrence } from './recurrence';

describe('recurrence rules', () => {
  it('CP-06-03: daily moves the due date one day', () => {
    expect(nextDueDate({ kind: 'daily' }, '2026-03-10', '2026-03-10')).toBe('2026-03-11');
    expect(nextDueDate({ kind: 'daily' }, '2026-12-31', '2026-12-31')).toBe('2027-01-01');
  });

  it('CP-06-04: weekly goes to the next chosen weekday, never the same day', () => {
    const friday = { kind: 'weekly', weekday: 5 } as const;
    // 2026-03-06 is a Friday.
    expect(nextDueDate(friday, '2026-03-06', '2026-03-06')).toBe('2026-03-13');
    expect(nextDueDate(friday, '2026-03-02', '2026-03-02')).toBe('2026-03-06');
    expect(nextDueDate({ kind: 'weekly', weekday: 7 }, '2026-03-06', '2026-03-06')).toBe(
      '2026-03-08',
    );
  });

  it('CP-06-05: monthly goes to day N of the next month', () => {
    const rule = { kind: 'monthly', monthDay: 15 } as const;
    expect(nextDueDate(rule, '2026-03-15', '2026-03-15')).toBe('2026-04-15');
    expect(nextDueDate(rule, '2026-12-15', '2026-12-15')).toBe('2027-01-15');
  });

  it('CP-06-06: monthly day 31 clamps to short months and returns to 31', () => {
    const rule = { kind: 'monthly', monthDay: 31 } as const;
    const feb = nextDueDate(rule, '2026-01-31', '2026-01-31');
    expect(feb).toBe('2026-02-28');
    const mar = nextDueDate(rule, feb, feb);
    expect(mar).toBe('2026-03-31');
    expect(nextDueDate(rule, '2028-01-31', '2028-01-31')).toBe('2028-02-29');
  });

  it('CP-06-07: an overdue instance advances from its due date, landing on the first future date', () => {
    expect(nextDueDate({ kind: 'daily' }, '2026-03-01', '2026-03-10')).toBe('2026-03-10');
    // Two days late: next-from-due is still in the past, so the first future Friday is used.
    expect(nextDueDate({ kind: 'weekly', weekday: 5 }, '2026-02-20', '2026-03-10')).toBe(
      '2026-03-13',
    );
    expect(nextDueDate({ kind: 'monthly', monthDay: 5 }, '2026-01-05', '2026-03-10')).toBe(
      '2026-04-05',
    );
    // Slightly late but the computed date is not in the past: keep it.
    expect(nextDueDate({ kind: 'daily' }, '2026-03-09', '2026-03-10')).toBe('2026-03-10');
  });

  it('CP-06-12: rejects weekly without day and monthly day out of range', () => {
    expect(validateRecurrence({ kind: 'weekly' })).toEqual({
      ok: false,
      error: 'recurrence_weekday',
    });
    expect(validateRecurrence({ kind: 'weekly', weekday: 8 }).ok).toBe(false);
    for (const monthDay of [0, 32, 1.5, '5']) {
      expect(validateRecurrence({ kind: 'monthly', monthDay })).toEqual({
        ok: false,
        error: 'recurrence_month_day',
      });
    }
    expect(validateRecurrence({ kind: 'yearly' })).toEqual({
      ok: false,
      error: 'invalid_recurrence',
    });
    expect(validateRecurrence(undefined)).toEqual({ ok: true, rule: { kind: 'once' } });
  });

  it('round-trips through the RRULE text', () => {
    for (const rule of [
      { kind: 'daily' },
      { kind: 'weekly', weekday: 5 },
      { kind: 'monthly', monthDay: 31 },
    ] as const) {
      expect(fromRRule(toRRule(rule))).toEqual(rule);
    }
    expect(toRRule({ kind: 'weekly', weekday: 5 })).toBe('FREQ=WEEKLY;BYDAY=FR');
    expect(fromRRule('FREQ=MONTHLY;BYMONTHDAY=40')).toBeNull();
    expect(fromRRule('nonsense')).toBeNull();
  });
});
