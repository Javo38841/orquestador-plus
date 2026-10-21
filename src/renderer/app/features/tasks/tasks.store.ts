import { computed, inject, Injectable, signal } from '@angular/core';
import {
  validateTaskInput,
  type Project,
  type Task,
  type TaskError,
  type TaskInput,
  type TaskStatus,
} from '../../../../shared/tasks';
import { isSeriesRule, type RecurrenceKind } from '../../../../shared/recurrence';
import { DESKTOP_API } from '../../core/desktop-api';

@Injectable({ providedIn: 'root' })
export class TasksStore {
  private readonly api = inject(DESKTOP_API);
  private readonly taskList = signal<Task[]>([]);
  private readonly projectList = signal<Project[]>([]);
  private readonly tagList = signal<string[]>([]);

  readonly tasks = this.taskList.asReadonly();
  readonly projects = this.projectList.asReadonly();
  /** Tags in use, for suggestions and the filter. */
  readonly tags = this.tagList.asReadonly();
  /** Tag the list is filtered by, or null for all tasks. */
  readonly tagFilter = signal<string | null>(null);
  /** Pending view by default; completed tasks come back when this is on. */
  readonly showCompleted = signal(false);
  readonly visible = computed(() => {
    const tag = this.tagFilter();
    return this.taskList().filter(
      (t) =>
        (this.showCompleted() || t.status !== 'done') && (tag === null || t.tags.includes(tag)),
    );
  });

  /** Project the "Series recurrentes" tab is filtered by, or null for all. */
  readonly seriesProjectFilter = signal<number | null>(null);
  /** Repetition type the "Series recurrentes" tab is filtered by, or null for all. */
  readonly seriesKindFilter = signal<RecurrenceKind | null>(null);
  /** One entry per series: its open instance, which carries the rule and next due date. */
  readonly series = computed(() =>
    this.taskList().filter(
      (t) => t.seriesId !== null && t.status !== 'done' && isSeriesRule(t.recurrence),
    ),
  );
  readonly visibleSeries = computed(() => {
    const project = this.seriesProjectFilter();
    const kind = this.seriesKindFilter();
    return this.series()
      .filter(
        (t) =>
          (project === null || t.projectId === project) &&
          (kind === null || t.recurrence.kind === kind),
      )
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  });

  async load(): Promise<void> {
    if (!this.api) return;
    const [tasks, projects, tags] = await Promise.all([
      this.api.listTasks(),
      this.api.listProjects(),
      this.api.listTags(),
    ]);
    this.taskList.set(tasks);
    this.projectList.set(projects);
    this.tagList.set(tags);
    // A filter on a tag nobody uses anymore would hide everything.
    if (this.tagFilter() !== null && !tags.includes(this.tagFilter()!)) this.tagFilter.set(null);
  }

  /** Creates (no `id`) or edits a task. Returns the validation error, if any. */
  async save(input: TaskInput, id: number | null = null): Promise<TaskError | null> {
    const checked = validateTaskInput(input);
    if (!checked.ok) return checked.error;
    if (!this.api) return null;

    const result =
      id === null ? await this.api.createTask(input) : await this.api.updateTask(id, input);
    if (!result.ok) return result.error;
    // A task may have created a project, so reload both lists in server order.
    await this.load();
    return null;
  }

  async setDone(task: Task, done: boolean): Promise<void> {
    await this.move(task, done ? 'done' : 'todo');
  }

  /** Deletes a series and its open instance; completed instances stay as history. */
  async removeSeries(seriesId: number): Promise<void> {
    if (!this.api) return;
    if (await this.api.deleteSeries(seriesId)) await this.load();
  }

  /** Moves a task to another status (board columns); "done" completes it. */
  async move(task: Task, status: TaskStatus): Promise<void> {
    if (!this.api) return;
    const result = await this.api.setTaskStatus(task.id, status);
    if (!result.ok) return;
    if (task.seriesId !== null) {
      // Completing or reopening a series instance creates or drops other instances.
      await this.load();
      return;
    }
    this.taskList.update((list) => list.map((t) => (t.id === task.id ? result.task : t)));
  }

  async setForToday(task: Task, forToday: boolean): Promise<void> {
    if (!this.api) return;
    const result = await this.api.setTaskForToday(task.id, forToday);
    if (result.ok) {
      this.taskList.update((list) => list.map((t) => (t.id === task.id ? result.task : t)));
    }
  }

  async remove(task: Task): Promise<void> {
    if (!this.api) return;
    if (await this.api.deleteTask(task.id)) {
      this.taskList.update((list) => list.filter((t) => t.id !== task.id));
      this.tagList.set([...new Set(this.taskList().flatMap((t) => t.tags))].sort());
    }
  }
}
