import { describe, expect, it } from 'vitest';
import {
  filterTopics,
  TOPIC_TITLE_MAX_LENGTH,
  validateTopicInput,
  type Topic,
  type TopicStatus,
} from './learning';

const topic = (id: number, status: TopicStatus): Topic => ({
  id,
  title: `t${id}`,
  notes: '',
  status,
  createdAt: 'x',
  updatedAt: 'x',
});

describe('learning topics validation', () => {
  it('CP-14-02: rejects blank titles', () => {
    expect(validateTopicInput({ title: '   ' })).toEqual({ ok: false, error: 'empty_title' });
    expect(validateTopicInput({ title: '' })).toEqual({ ok: false, error: 'empty_title' });
  });

  it('trims the title and defaults the notes', () => {
    expect(validateTopicInput({ title: ' Rust ' })).toEqual({ ok: true, title: 'Rust', notes: '' });
  });

  it('rejects malformed and oversized input', () => {
    expect(validateTopicInput(null)).toEqual({ ok: false, error: 'invalid' });
    expect(validateTopicInput({ title: 3 })).toEqual({ ok: false, error: 'invalid' });
    expect(validateTopicInput({ title: 'a', notes: 3 })).toEqual({ ok: false, error: 'invalid' });
    expect(validateTopicInput({ title: 'a'.repeat(TOPIC_TITLE_MAX_LENGTH + 1) })).toEqual({
      ok: false,
      error: 'too_long',
    });
  });

  it('CP-14-07: filters by status and "all" keeps everything', () => {
    const all = [topic(1, 'todo'), topic(2, 'in_progress'), topic(3, 'done')];
    expect(filterTopics(all, 'in_progress').map((t) => t.id)).toEqual([2]);
    expect(filterTopics(all, 'all')).toEqual(all);
  });
});
