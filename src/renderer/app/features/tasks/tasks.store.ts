import { computed, inject, Injectable, signal } from '@angular/core';
import {
  localDate,
  validateProjectName,
  validateTaskInput,
  type Project,
  type Task,
  type TaskError,
  type TaskInput,
  type TaskStatus,
} from '../../../../shared/tasks';
import { isDoneToday } from '../../../../shared/today';
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
  /**
   * Pending view by default, where tasks completed today stay struck through until taken off the
   * list; every completed task comes back when this is on.
   */
  readonly showCompleted = signal(false);
  /** Project the "Tareas" tab is filtered by: an id, 'loose' for no project, or null for all. */
  readonly projectFilter = signal<number | 'loose' | null>(null);
  /** Repetition type the "Tareas" tab is filtered by (including 'once'), or null for all. */
  readonly kindFilter = signal<RecurrenceKind | null>(null);
  readonly visible = computed(() => {
    const tag = this.tagFilter();
    const project = this.projectFilter();
    const kind = this.kindFilter();
    const today = localDate(new Date());
    return this.taskList().filter(
      (t) =>
        (this.showCompleted() || t.status !== 'done' || isDoneToday(t, today)) &&
        (tag === null || t.tags.includes(tag)) &&
        (project === null ||
          (project === 'loose' ? t.projectId === null : t.projectId === project)) &&
        (kind === null || t.recurrence.kind === kind),
    );
  });
  /** Visible tasks completed today and not taken off the list: struck through, removable. */
  readonly doneShown = computed(() => {
    const today = localDate(new Date());
    return this.visible().filter((t) => isDoneToday(t, today));
  });
  /** Unfinished tasks, for the "Tareas" tab counter. */
  readonly pendingCount = computed(() => this.taskList().filter((t) => t.status !== 'done').length);

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
  readonly seriesCount = computed(() => this.series().length);
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
    const project = this.projectFilter();
    if (typeof project === 'number' && !projects.some((p) => p.id === project)) {
      this.projectFilter.set(null);
    }
  }

  /** Creates a project by name. Returns the new project, or the error. */
  async createProject(name: string): Promise<{ project: Project } | { error: TaskError }> {
    const checked = validateProjectName(name);
    if (!checked.ok) return { error: checked.error };
    if (!this.api) return { error: 'invalid_project' };
    const result = await this.api.createProject(checked.name);
    if (!result.ok) return { error: result.error };
    this.projectList.update((list) =>
      [...list, result.project].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      ),
    );
    return { project: result.project };
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

  /** Creates a task straight into a board column ("Hecho" completes it). */
  async create(input: TaskInput, status: TaskStatus): Promise<TaskError | null> {
    const checked = validateTaskInput(input);
    if (!checked.ok) return checked.error;
    if (!this.api) return null;

    const result = await this.api.createTask(input);
    if (!result.ok) return result.error;
    if (status !== 'todo') await this.api.setTaskStatus(result.task.id, status);
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

  /** Takes completed tasks off Hoy and Tareas (one shared "Quitar de la lista"); they are kept. */
  async hideFromToday(tasks: Task[]): Promise<void> {
    const ids = tasks.filter((t) => t.status === 'done').map((t) => t.id);
    if (!this.api || ids.length === 0) return;
    if ((await this.api.hideFromToday(ids)) > 0) await this.load();
  }

  async remove(task: Task): Promise<void> {
    if (!this.api) return;
    if (await this.api.deleteTask(task.id)) {
      this.taskList.update((list) => list.filter((t) => t.id !== task.id));
      this.tagList.set([...new Set(this.taskList().flatMap((t) => t.tags))].sort());
    }
  }
}
