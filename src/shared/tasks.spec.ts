import { describe, expect, it } from 'vitest';
import {
  isOverdue,
  isValidDate,
  localDate,
  normalizeTag,
  suggestTags,
  validateTag,
  validateTaskInput,
} from './tasks';

describe('validateTaskInput', () => {
  it('CP-02-06: rejects an empty or whitespace title', () => {
    expect(validateTaskInput({ title: '   ', dueDate: null, projectId: null })).toEqual({
      ok: false,
      error: 'empty',
    });
    expect(validateTaskInput(null)).toEqual({ ok: false, error: 'empty' });
  });

  it('CP-02-06: rejects 201 characters and accepts exactly 200', () => {
    expect(validateTaskInput({ title: 'a'.repeat(201) })).toEqual({ ok: false, error: 'too_long' });
    expect(validateTaskInput({ title: 'a'.repeat(200) }).ok).toBe(true);
  });

  it('rejects impossible dates and bad project ids', () => {
    expect(validateTaskInput({ title: 'x', dueDate: '2026-02-30' })).toEqual({
      ok: false,
      error: 'invalid_date',
    });
    expect(validateTaskInput({ title: 'x', projectId: '1' })).toEqual({
      ok: false,
      error: 'invalid_project',
    });
  });

  it('trims the title and normalizes empty optional fields', () => {
    expect(validateTaskInput({ title: ' hola ', dueDate: '', newProjectName: ' api ' })).toEqual({
      ok: true,
      value: {
        title: 'hola',
        dueDate: null,
        projectId: null,
        newProjectName: 'api',
        tags: [],
        recurrence: { kind: 'once' },
      },
    });
  });
});

describe('dates', () => {
  it('validates calendar dates', () => {
    expect(isValidDate('2026-02-28')).toBe(true);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('26-1-1')).toBe(false);
  });

  it('formats the local date', () => {
    expect(localDate(new Date(2026, 2, 5))).toBe('2026-03-05');
  });

  it('CP-02-08: only pending tasks due before today are overdue', () => {
    expect(isOverdue({ status: 'todo', dueDate: '2026-03-04' }, '2026-03-05')).toBe(true);
    expect(isOverdue({ status: 'todo', dueDate: '2026-03-05' }, '2026-03-05')).toBe(false);
    expect(isOverdue({ status: 'done', dueDate: '2026-03-04' }, '2026-03-05')).toBe(false);
    expect(isOverdue({ status: 'todo', dueDate: null }, '2026-03-05')).toBe(false);
  });
});

describe('tags', () => {
  it('CP-07-02: "Infra", "#infra" and "infra" are the same tag and are not duplicated', () => {
    expect(['Infra', '#infra', ' infra '].map(normalizeTag)).toEqual(['infra', 'infra', 'infra']);
    const checked = validateTaskInput({ title: 'x', tags: ['Infra', '#infra', 'infra', 'api'] });
    expect(checked.ok && checked.value.tags).toEqual(['api', 'infra']);
  });

  it('CP-07-03: rejects empty, only-spaces and "#" tags', () => {
    for (const raw of ['', '   ', '#', 5]) {
      expect(validateTag(raw)).toEqual({ ok: false, error: 'tag_empty' });
    }
    expect(validateTaskInput({ title: 'x', tags: [' '] })).toEqual({
      ok: false,
      error: 'tag_empty',
    });
  });

  it('CP-07-03: rejects tags with inner spaces and over 30 characters, accepts exactly 30', () => {
    expect(validateTag('dos palabras')).toEqual({ ok: false, error: 'tag_spaces' });
    expect(validateTag('a'.repeat(31))).toEqual({ ok: false, error: 'tag_too_long' });
    expect(validateTag('#' + 'a'.repeat(30))).toEqual({ ok: true, tag: 'a'.repeat(30) });
  });

  it('CP-07-06: suggests existing tags that start with what is typed, minus the chosen ones', () => {
    const known = ['infra', 'infrared', 'api', 'ui'];
    expect(suggestTags(known, 'in')).toEqual(['infra', 'infrared']);
    expect(suggestTags(known, '#IN', ['infra'])).toEqual(['infrared']);
    expect(suggestTags(known, '')).toEqual([]);
    expect(suggestTags(known, 'zz')).toEqual([]);
  });
});
