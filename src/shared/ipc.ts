import type { Bug, BugInput, BugResult, BugStatus } from './bugs';
import type { Topic, TopicInput, TopicResult, TopicStatus } from './learning';
import type { Snippet, SnippetInput, SnippetResult } from './snippets';
import type { JournalEntry, JournalResult } from './journal';
import type { CaptureResult, InboxItem } from './inbox';
import type { PortalLinkInput, PortalLinkResult, PortalLink, PortalStatus } from './portal';
import type { SearchResult } from './search';
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
  listSnippets: 'snippets:list',
  createSnippet: 'snippets:create',
  updateSnippet: 'snippets:update',
  deleteSnippet: 'snippets:delete',
  copyToClipboard: 'clipboard:write-text',
  listTopics: 'learning:list',
  createTopic: 'learning:create',
  updateTopic: 'learning:update',
  setTopicStatus: 'learning:set-status',
  deleteTopic: 'learning:delete',
  listJournal: 'journal:list',
  saveJournalEntry: 'journal:save',
  search: 'search:query',
  getPortalStatus: 'portal:get-status',
  setPortalEnabled: 'portal:set-enabled',
  listPortalLinks: 'portal:list-links',
  createPortalLink: 'portal:create-link',
  revokePortalLink: 'portal:revoke-link',
  getRemindersEnabled: 'settings:get-reminders-enabled',
  setRemindersEnabled: 'settings:set-reminders-enabled',
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
  /** Snippets and commands, newest first (RF-13). */
  listSnippets(): Promise<Snippet[]>;
  createSnippet(input: SnippetInput): Promise<SnippetResult>;
  /** Edits a snippet; its creation date is kept. */
  updateSnippet(id: number, input: SnippetInput): Promise<SnippetResult>;
  /** Deletes the snippet and unlinks its tags. */
  deleteSnippet(id: number): Promise<boolean>;
  /** Writes the text, exactly as given, to the system clipboard. Resolves false if rejected. */
  copyToClipboard(text: string): Promise<boolean>;
  /** Learning topics, newest first (RF-14). */
  listTopics(): Promise<Topic[]>;
  /** Creates a topic with progress "todo". */
  createTopic(input: TopicInput): Promise<TopicResult>;
  /** Edits title and notes; status and creation date are kept. */
  updateTopic(id: number, input: TopicInput): Promise<TopicResult>;
  setTopicStatus(id: number, status: TopicStatus): Promise<TopicResult>;
  deleteTopic(id: number): Promise<boolean>;
  /** Journal entries, most recent day first (RF-12). */
  listJournal(): Promise<JournalEntry[]>;
  /** Upserts the day's entry; a blank text deletes it. */
  saveJournalEntry(date: string, text: string): Promise<JournalResult>;
  /** Global search over tasks and inbox items, at most 50 results by relevance (RF-10). */
  search(text: string): Promise<SearchResult[]>;
  /** Whether the local-network report portal is listening, and where (RF-15). */
  getPortalStatus(): Promise<PortalStatus>;
  /** Starts or stops the portal. It is always off when the app starts. */
  setPortalEnabled(enabled: boolean): Promise<PortalStatus>;
  /** Portal links, newest first. */
  listPortalLinks(): Promise<PortalLink[]>;
  createPortalLink(input: PortalLinkInput): Promise<PortalLinkResult>;
  /** Revokes a link: it stops accepting reports. Resolves false if it does not exist. */
  revokePortalLink(id: number): Promise<boolean>;
  /** Whether task reminders show a notification (RF-18). */
  getRemindersEnabled(): Promise<boolean>;
  setRemindersEnabled(enabled: boolean): Promise<boolean>;
}
