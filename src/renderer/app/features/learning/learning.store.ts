import { inject, Injectable, signal } from '@angular/core';
import {
  validateTopicInput,
  type Topic,
  type TopicError,
  type TopicInput,
  type TopicStatus,
} from '../../../../shared/learning';
import { DESKTOP_API } from '../../core/desktop-api';

@Injectable({ providedIn: 'root' })
export class LearningStore {
  private readonly api = inject(DESKTOP_API);
  private readonly list = signal<Topic[]>([]);

  readonly topics = this.list.asReadonly();

  async load(): Promise<void> {
    if (!this.api) return;
    this.list.set(await this.api.listTopics());
  }

  /** Validates locally, saves through the API and puts the new topic first. */
  async create(input: TopicInput): Promise<TopicError | null> {
    const checked = validateTopicInput(input);
    if (!checked.ok) return checked.error;
    if (!this.api) return null;
    const result = await this.api.createTopic(input);
    if (!result.ok) return result.error;
    this.list.update((topics) => [result.topic, ...topics]);
    return null;
  }

  async update(id: number, input: TopicInput): Promise<TopicError | null> {
    const checked = validateTopicInput(input);
    if (!checked.ok) return checked.error;
    if (!this.api) return null;
    return this.replace(id, await this.api.updateTopic(id, input));
  }

  async setStatus(id: number, status: TopicStatus): Promise<TopicError | null> {
    if (!this.api) return null;
    return this.replace(id, await this.api.setTopicStatus(id, status));
  }

  async remove(id: number): Promise<void> {
    if (!this.api) return;
    if (await this.api.deleteTopic(id)) {
      this.list.update((topics) => topics.filter((t) => t.id !== id));
    }
  }

  private replace(
    id: number,
    result: { ok: true; topic: Topic } | { ok: false; error: TopicError },
  ): TopicError | null {
    if (!result.ok) {
      // A topic that vanished underneath us is dropped from the list.
      if (result.error === 'not_found') void this.load();
      return result.error;
    }
    this.list.update((topics) => topics.map((t) => (t.id === id ? result.topic : t)));
    return null;
  }
}
