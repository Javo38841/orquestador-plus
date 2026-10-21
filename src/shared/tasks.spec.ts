import { describe, expect, it } from 'vitest';
import { isOverdue, isValidDate, localDate, validateTaskInput } from './tasks';

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
      value: { title: 'hola', dueDate: null, projectId: null, newProjectName: 'api' },
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
