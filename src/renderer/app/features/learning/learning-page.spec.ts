import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type { Topic, TopicInput, TopicResult } from '../../../../shared/learning';
import { DESKTOP_API } from '../../core/desktop-api';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { LearningPage } from './learning-page';

const topic = (id: number, extra: Partial<Topic> = {}): Topic => ({
  id,
  title: `topic ${id}`,
  notes: '',
  status: 'todo',
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
  ...extra,
});

async function render(stored: Topic[] = []) {
  const api = {
    listTopics: vi.fn(async () => stored),
    createTopic: vi.fn(async (input: TopicInput): Promise<TopicResult> => ({
      ok: true,
      topic: topic(10, { title: input.title, notes: input.notes ?? '' }),
    })),
    updateTopic: vi.fn(async (id: number, input: TopicInput): Promise<TopicResult> => ({
      ok: true,
      topic: topic(id, { title: input.title, notes: input.notes ?? '' }),
    })),
    setTopicStatus: vi.fn(async (id: number, status): Promise<TopicResult> => ({
      ok: true,
      topic: topic(id, { status }),
    })),
    deleteTopic: vi.fn(async () => true),
  };
  await TestBed.configureTestingModule({
    imports: [
      LearningPage,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
    providers: [{ provide: DESKTOP_API, useValue: api as unknown as OrquestadorApi }],
  }).compileComponents();
  const fixture = TestBed.createComponent(LearningPage);
  const el = fixture.nativeElement as HTMLElement;
  fixture.detectChanges();
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  const q = (testId: string) => el.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
  const click = async (testId: string, index = 0) => {
    (el.querySelectorAll(`[data-testid="${testId}"]`)[index] as HTMLElement).click();
    await settle();
  };
  const type = async (testId: string, value: string, event = 'input') => {
    const field = q(testId) as HTMLInputElement;
    field.value = value;
    field.dispatchEvent(new Event(event));
    await settle();
  };
  const titles = () =>
    [...el.querySelectorAll('[data-testid="topic-card-title"]')].map((c) => c.textContent?.trim());
  return { api, q, click, type, titles };
}

describe('LearningPage', () => {
  it('CP-14-08: with no topics it shows an empty state inviting to create the first', async () => {
    const { q, click } = await render([]);
    expect(q('topics-empty')?.textContent).toContain('Todavía no hay temas');
    expect(q('empty-new-topic')?.textContent).toContain('Crear el primer tema');
    await click('empty-new-topic');
    expect(q('topic-form')).not.toBeNull();
  });

  it('CP-14-01: creating a topic sends the form and lists it as "Por empezar"', async () => {
    const { api, q, click, type, titles } = await render([topic(1)]);
    await click('new-topic');
    await type('topic-title', 'Rust');
    await click('topic-save');
    expect(api.createTopic).toHaveBeenCalledWith({ title: 'Rust', notes: '' });
    expect(q('topic-form')).toBeNull();
    expect(titles()[0]).toBe('Rust');
    expect(q('topic-status-chip')?.textContent?.trim()).toBe('Por empezar');
  });

  it('CP-14-02: a blank title shows an error and does not call the API', async () => {
    const { api, q, click, type } = await render([topic(1)]);
    await click('new-topic');
    await type('topic-title', '   ');
    await click('topic-save');
    expect(api.createTopic).not.toHaveBeenCalled();
    expect(q('topic-error')?.textContent).toContain('Escribe el nombre del tema');
  });

  it('CP-14-03: changing the status calls the API and updates the chip', async () => {
    const { api, q, type } = await render([topic(1)]);
    await type('topic-status', 'in_progress', 'change');
    expect(api.setTopicStatus).toHaveBeenCalledWith(1, 'in_progress');
    expect(q('topic-status-chip')?.textContent?.trim()).toBe('En curso');
  });

  it('CP-14-05: editing a topic sends the new title and notes', async () => {
    const { api, click, type, titles } = await render([topic(1, { notes: 'old' })]);
    await click('topic-edit');
    await type('topic-title', 'Nuevo');
    await type('topic-notes', 'apuntes');
    await click('topic-save');
    expect(api.updateTopic).toHaveBeenCalledWith(1, { title: 'Nuevo', notes: 'apuntes' });
    expect(titles()).toEqual(['Nuevo']);
  });

  it('CP-14-06: deleting asks for confirmation and removes the topic', async () => {
    const { api, click, titles } = await render([topic(2), topic(1)]);
    await click('topic-delete');
    expect(api.deleteTopic).not.toHaveBeenCalled();
    await click('topic-delete-confirm');
    expect(api.deleteTopic).toHaveBeenCalledWith(2);
    expect(titles()).toEqual(['topic 1']);
  });

  it('CP-14-07: filters by status and "Todos" shows everything', async () => {
    const { q, click, titles } = await render([
      topic(3, { status: 'done' }),
      topic(2, { status: 'in_progress' }),
      topic(1),
    ]);
    await click('filter-in_progress');
    expect(titles()).toEqual(['topic 2']);
    await click('filter-all');
    expect(titles()).toEqual(['topic 3', 'topic 2', 'topic 1']);
    await click('filter-done');
    await click('topic-delete');
    await click('topic-delete-confirm');
    expect(q('topics-empty-filter')?.textContent).toContain('No hay temas en este filtro');
  });
});
