import { computed, inject, Injectable, signal } from '@angular/core';
import {
  validateTaskInput,
  type Project,
  type Task,
  type TaskError,
  type TaskInput,
} from '../../../../shared/tasks';
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
        (this.showCompleted() || t.status === 'todo') && (tag === null || t.tags.includes(tag)),
    );
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
    if (!this.api) return;
    const result = await this.api.setTaskStatus(task.id, done ? 'done' : 'todo');
    if (result.ok) {
      this.taskList.update((list) => list.map((t) => (t.id === task.id ? result.task : t)));
    }
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
