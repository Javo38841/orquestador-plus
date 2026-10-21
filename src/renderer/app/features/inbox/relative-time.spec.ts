import { relativeTime } from './relative-time';

describe('relativeTime', () => {
  const now = new Date('2026-03-10T12:00:00Z');

  it('CP-01-07: formats minutes and yesterday in Spanish', () => {
    expect(relativeTime('2026-03-10T11:48:00Z', now)).toBe('hace 12 min');
    expect(relativeTime('2026-03-09T12:00:00Z', now)).toBe('ayer');
  });

  it('formats hours and days', () => {
    expect(relativeTime('2026-03-10T09:00:00Z', now)).toBe('hace 3 h');
    expect(relativeTime('2026-03-07T12:00:00Z', now)).toBe('hace 3 d');
  });

  it('says "ahora" for the current moment', () => {
    expect(relativeTime('2026-03-10T12:00:00Z', now)).toBe('ahora');
  });
});
