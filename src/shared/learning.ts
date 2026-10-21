/** Learning topics (RF-14). Shared so main and renderer validate and filter alike. */
export const TOPIC_TITLE_MAX_LENGTH = 200;
export const TOPIC_NOTES_MAX_LENGTH = 20_000;

export const TOPIC_STATUSES = ['todo', 'in_progress', 'done'] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

export type TopicStatusFilter = 'all' | TopicStatus;

export interface Topic {
  id: number;
  title: string;
  /** Plain text, stored verbatim. */
  notes: string;
  status: TopicStatus;
  /** ISO-8601 UTC timestamps. */
  createdAt: string;
  updatedAt: string;
}

export interface TopicInput {
  title: string;
  notes?: string;
}

export type TopicError = 'empty_title' | 'too_long' | 'invalid' | 'invalid_status' | 'not_found';

export type TopicResult = { ok: true; topic: Topic } | { ok: false; error: TopicError };

export function isTopicStatus(value: unknown): value is TopicStatus {
  return typeof value === 'string' && (TOPIC_STATUSES as readonly string[]).includes(value);
}

/** Topics in the chosen status; "all" keeps every topic. */
export function filterTopics(topics: Topic[], status: TopicStatusFilter): Topic[] {
  return status === 'all' ? topics : topics.filter((t) => t.status === status);
}

/** Checks a topic form. The title is trimmed; blank notes become an empty string. */
export function validateTopicInput(
  input: unknown,
): { ok: true; title: string; notes: string } | { ok: false; error: TopicError } {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'invalid' };
  const raw = input as Record<string, unknown>;
  if (typeof raw['title'] !== 'string') return { ok: false, error: 'invalid' };
  const notes = raw['notes'] ?? '';
  if (typeof notes !== 'string') return { ok: false, error: 'invalid' };
  const title = raw['title'].trim();
  if (title.length === 0) return { ok: false, error: 'empty_title' };
  if (title.length > TOPIC_TITLE_MAX_LENGTH || notes.length > TOPIC_NOTES_MAX_LENGTH) {
    return { ok: false, error: 'too_long' };
  }
  return { ok: true, title, notes };
}
