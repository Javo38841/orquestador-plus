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

  readonly tasks = this.taskList.asReadonly();
  readonly projects = this.projectList.asReadonly();
  /** Pending view by default; completed tasks come back when this is on. */
  readonly showCompleted = signal(false);
  readonly visible = computed(() =>
    this.showCompleted() ? this.taskList() : this.taskList().filter((t) => t.status === 'todo'),
  );

  async load(): Promise<void> {
    if (!this.api) return;
    const [tasks, projects] = await Promise.all([this.api.listTasks(), this.api.listProjects()]);
    this.taskList.set(tasks);
    this.projectList.set(projects);
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

  async remove(task: Task): Promise<void> {
    if (!this.api) return;
    if (await this.api.deleteTask(task.id)) {
      this.taskList.update((list) => list.filter((t) => t.id !== task.id));
    }
  }
}
