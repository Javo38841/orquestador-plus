import type { Bug, BugInput, BugResult, BugStatus } from './bugs';
import type { CaptureResult, InboxItem } from './inbox';
import type { NoteInput, NoteResult, NoteSummary } from './wiki';
import type { Project, ProjectResult, Task, TaskInput, TaskResult, TaskStatus } from './tasks';

/**
 * IPC contract between main, preload and renderer (ADR-003).
 * Every capability the UI can use is declared here first.
 */

export const IpcChannel = {
  getAppInfo: 'app:get-info',
  captureInbox: 'inbox:capture',
  listInbox: 'inbox:list',
  convertInboxItem: 'inbox:convert',
  discardInboxItem: 'inbox:discard',
  listTasks: 'tasks:list',
  createTask: 'tasks:create',
  updateTask: 'tasks:update',
  setTaskStatus: 'tasks:set-status',
  setTaskForToday: 'tasks:set-for-today',
  deleteTask: 'tasks:delete',
  deleteSeries: 'series:delete',
  listTags: 'tags:list',
  listProjects: 'projects:list',
  createProject: 'projects:create',
  deleteProject: 'projects:delete',
  listNotes: 'notes:list',
  getNote: 'notes:get',
  createNote: 'notes:create',
  updateNote: 'notes:update',
  deleteNote: 'notes:delete',
  listBugs: 'bugs:list',
  createBug: 'bugs:create',
  updateBug: 'bugs:update',
  setBugStatus: 'bugs:set-status',
  deleteBug: 'bugs:delete',
} as const;

export type ReleaseChannel = 'dev' | 'prod';

export interface AppInfo {
  name: string;
  version: string;
  channel: ReleaseChannel;
  platform: string;
  databaseReady: boolean;
}

/** API exposed by the preload as `window.orquestador`. */
export interface OrquestadorApi {
  getAppInfo(): Promise<AppInfo>;
  captureInbox(text: string): Promise<CaptureResult>;
  listInbox(): Promise<InboxItem[]>;
  /** Creates a task from the item and removes the item from the inbox, atomically. */
  convertInboxItem(id: number, input: TaskInput): Promise<TaskResult>;
  discardInboxItem(id: number): Promise<boolean>;
  listTasks(): Promise<Task[]>;
  createTask(input: TaskInput): Promise<TaskResult>;
  updateTask(id: number, input: TaskInput): Promise<TaskResult>;
  setTaskStatus(id: number, status: TaskStatus): Promise<TaskResult>;
  setTaskForToday(id: number, forToday: boolean): Promise<TaskResult>;
  deleteTask(id: number): Promise<boolean>;
  /** Deletes a recurring series and its open instance; completed instances stay. */
  deleteSeries(id: number): Promise<boolean>;
  /** Tags used by at least one task, for suggestions and the filter. */
  listTags(): Promise<string[]>;
  listProjects(): Promise<Project[]>;
  createProject(name: string): Promise<ProjectResult>;
  deleteProject(id: number): Promise<boolean>;
  /** Wiki notes sorted by title (RF-08). */
  listNotes(): Promise<NoteSummary[]>;
  /** A note with its links and backlinks; `slug` is the file name without `.md`. */
  getNote(slug: string): Promise<NoteResult>;
  createNote(input: NoteInput): Promise<NoteResult>;
  /** Saves content and, if the title changed, renames the note. */
  updateNote(slug: string, input: NoteInput): Promise<NoteResult>;
  deleteNote(slug: string): Promise<boolean>;
  /** Bugs, newest first (RF-09). */
  listBugs(): Promise<Bug[]>;
  createBug(input: BugInput): Promise<BugResult>;
  updateBug(id: number, input: BugInput): Promise<BugResult>;
  setBugStatus(id: number, status: BugStatus): Promise<BugResult>;
  deleteBug(id: number): Promise<boolean>;
}
