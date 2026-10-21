import { describe, expect, it } from 'vitest';
import { isJournalDate, localJournalDate, sortJournal, validateJournalInput } from './journal';

describe('journal helpers', () => {
  it('accepts real days and rejects malformed or nonexistent ones', () => {
    expect(isJournalDate('2024-02-29')).toBe(true);
    expect(isJournalDate('2026-02-29')).toBe(false);
    expect(isJournalDate('2026-1-01')).toBe(false);
    expect(isJournalDate(5)).toBe(false);
  });

  it('formats the local day', () => {
    expect(localJournalDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('validates a payload and lets blank text through', () => {
    expect(validateJournalInput('2026-03-01', ' ')).toEqual({
      ok: true,
      date: '2026-03-01',
      text: ' ',
    });
    expect(validateJournalInput('nope', 'x')).toEqual({ ok: false, error: 'invalid' });
  });

  it('sorts newest first without mutating the input', () => {
    const input = [
      { date: '2026-01-01', text: '', updatedAt: '' },
      { date: '2026-02-01', text: '', updatedAt: '' },
    ];
    expect(sortJournal(input).map((e) => e.date)).toEqual(['2026-02-01', '2026-01-01']);
    expect(input[0].date).toBe('2026-01-01');
  });
});
