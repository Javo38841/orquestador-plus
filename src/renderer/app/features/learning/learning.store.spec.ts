import { TestBed } from '@angular/core/testing';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type { Topic, TopicInput, TopicResult } from '../../../../shared/learning';
import { DESKTOP_API } from '../../core/desktop-api';
import { LearningStore } from './learning.store';

const topic = (id: number, extra: Partial<Topic> = {}): Topic => ({
  id,
  title: `topic ${id}`,
  notes: '',
  status: 'todo',
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
  ...extra,
});

function setup(stored: Topic[] = []) {
  const api = {
    listTopics: vi.fn(async () => stored),
    createTopic: vi.fn(async (input: TopicInput): Promise<TopicResult> => ({
      ok: true,
      topic: topic(10, { title: input.title }),
    })),
    updateTopic: vi.fn(async (id: number, input: TopicInput): Promise<TopicResult> => ({
      ok: true,
      topic: topic(id, { title: input.title }),
    })),
    setTopicStatus: vi.fn(async (id: number, status): Promise<TopicResult> => ({
      ok: true,
      topic: topic(id, { status }),
    })),
    deleteTopic: vi.fn(async () => true),
  };
  TestBed.configureTestingModule({
    providers: [{ provide: DESKTOP_API, useValue: api as unknown as OrquestadorApi }],
  });
  return { api, store: TestBed.inject(LearningStore) };
}

describe('LearningStore', () => {
  it('loads the topics', async () => {
    const { store } = setup([topic(2), topic(1)]);
    await store.load();
    expect(store.topics().map((t) => t.id)).toEqual([2, 1]);
  });

  it('CP-14-02: a blank title is rejected without calling the API', async () => {
    const { api, store } = setup();
    expect(await store.create({ title: '  ' })).toBe('empty_title');
    expect(api.createTopic).not.toHaveBeenCalled();
  });

  it('CP-14-01: creating puts the new topic first', async () => {
    const { store } = setup([topic(1)]);
    await store.load();
    expect(await store.create({ title: 'Rust' })).toBeNull();
    expect(store.topics().map((t) => t.title)).toEqual(['Rust', 'topic 1']);
  });

  it('CP-14-03: changing the status replaces the topic', async () => {
    const { store } = setup([topic(1)]);
    await store.load();
    expect(await store.setStatus(1, 'in_progress')).toBeNull();
    expect(store.topics()[0]!.status).toBe('in_progress');
  });

  it('CP-14-05: editing replaces the topic', async () => {
    const { store } = setup([topic(1)]);
    await store.load();
    await store.update(1, { title: 'Nuevo' });
    expect(store.topics()[0]!.title).toBe('Nuevo');
  });

  it('CP-14-06: removing drops the topic; a missing one reloads the list', async () => {
    const { api, store } = setup([topic(1), topic(2)]);
    await store.load();
    await store.remove(1);
    expect(store.topics().map((t) => t.id)).toEqual([2]);
    api.setTopicStatus.mockResolvedValueOnce({ ok: false, error: 'not_found' });
    expect(await store.setStatus(2, 'done')).toBe('not_found');
    expect(api.listTopics).toHaveBeenCalledTimes(2);
  });
});
