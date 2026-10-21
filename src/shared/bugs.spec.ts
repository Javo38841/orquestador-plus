import { describe, expect, it } from 'vitest';
import { countOpenBugs, filterBugs, validateBugInput, type Bug, type BugStatus } from './bugs';

const bug = (id: number, status: BugStatus): Bug => ({
  id,
  code: `BUG-${id}`,
  title: `b${id}`,
  symptom: '',
  impact: '',
  rootCause: '',
  solution: '',
  severity: 'medium',
  status,
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
});

const bugs = [bug(1, 'new'), bug(2, 'analysis'), bug(3, 'resolved'), bug(4, 'verified')];

describe('bugs', () => {
  it('CP-09-09: "open" shows new and in analysis, "resolved" shows resolved and verified', () => {
    expect(filterBugs(bugs, 'open').map((b) => b.id)).toEqual([1, 2]);
    expect(filterBugs(bugs, 'resolved').map((b) => b.id)).toEqual([3, 4]);
    expect(filterBugs(bugs, 'all').map((b) => b.id)).toEqual([1, 2, 3, 4]);
  });

  it('CP-09-10: counts new and in-analysis bugs', () => {
    expect(countOpenBugs(bugs)).toBe(2);
    expect(countOpenBugs([])).toBe(0);
  });

  it('CP-09-04: validates the title and trims fields', () => {
    expect(validateBugInput({ title: '  ' })).toEqual({ ok: false, error: 'empty' });
    expect(validateBugInput({ title: 'a', symptom: 5 })).toEqual({ ok: false, error: 'invalid' });
    expect(validateBugInput({ title: ' a ', symptom: ' s ' })).toMatchObject({
      ok: true,
      title: 'a',
      symptom: 's',
    });
  });

  it('CP-09-06: severity defaults to medium', () => {
    expect(validateBugInput({ title: 'a' })).toMatchObject({ ok: true, severity: 'medium' });
  });

  it('CP-09-08: rejects an unknown severity', () => {
    expect(validateBugInput({ title: 'a', severity: 'urgent' })).toEqual({
      ok: false,
      error: 'invalid',
    });
  });
});
