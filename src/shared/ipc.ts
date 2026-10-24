import type { Bug, BugInput, BugResult, BugStatus } from './bugs';
import type { Topic, TopicInput, TopicResult, TopicStatus } from './learning';
import type { Snippet, SnippetInput, SnippetResult, SnippetsView } from './snippets';
import type { JournalEntry, JournalResult } from './journal';
import type { CaptureResult, InboxConversion, InboxConvertResult, InboxItem } from './inbox';
import type { PortalLinkInput, PortalLinkResult, PortalLink, PortalStatus } from './portal';
import type { ExportResult } from './export';
import type { SearchResult } from './search';
import type {
  NoteInput,
  SkippedFile,
  NoteResult,
  NoteSummary,
  SectionInput,
  SectionResult,
  SectionSummary,
} from './wiki';
import type { AttachmentImageResult, AttachmentInput, AttachmentResult } from './attachments';
import type { BoardSelection } from './board';
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
  hideFromToday: 'tasks:hide-from-today',
  deleteSeries: 'series:delete',
  listTags: 'tags:list',
  listProjects: 'projects:list',
  createProject: 'projects:create',
  deleteProject: 'projects:delete',
  listNotes: 'notes:list',
  listSections: 'notes:list-sections',
  createSection: 'notes:create-section',
  listSkippedFiles: 'notes:list-skipped',
  openWikiFolder: 'wiki:open-folder',
  getNote: 'notes:get',
  createNote: 'notes:create',
  updateNote: 'notes:update',
  deleteNote: 'notes:delete',
  moveNote: 'notes:move',
  attachFile: 'notes:attach',
  readAttachment: 'notes:read-attachment',
  openAttachment: 'notes:open-attachment',
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
  getBoardProject: 'settings:get-board-project',
  setBoardProject: 'settings:set-board-project',
  getBoardPanelOpen: 'settings:get-board-panel-open',
  setBoardPanelOpen: 'settings:set-board-panel-open',
  getSnippetsView: 'settings:get-snippets-view',
  setSnippetsView: 'settings:set-snippets-view',
  getFocusMinutes: 'settings:get-focus-minutes',
  setFocusMinutes: 'settings:set-focus-minutes',
  exportAll: 'export:all',
} as const;

/** Event main sends to the renderer when `wiki/` changed outside the app and the index was rebuilt. */
export const WIKI_CHANGED_EVENT = 'wiki:changed';

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
  /** Creates a task, a bug or a wiki note from the item and removes the item from the inbox, atomically. */
  convertInboxItem(id: number, conversion: InboxConversion): Promise<InboxConvertResult>;
  discardInboxItem(id: number): Promise<boolean>;
  listTasks(): Promise<Task[]>;
  createTask(input: TaskInput): Promise<TaskResult>;
  updateTask(id: number, input: TaskInput): Promise<TaskResult>;
  setTaskStatus(id: number, status: TaskStatus): Promise<TaskResult>;
  setTaskForToday(id: number, forToday: boolean): Promise<TaskResult>;
  deleteTask(id: number): Promise<boolean>;
  /** Takes completed tasks off Hoy without deleting them; returns how many were hidden. */
  hideFromToday(ids: number[]): Promise<number>;
  /** Deletes a recurring series and its open instance; completed instances stay. */
  deleteSeries(id: number): Promise<boolean>;
  /** Tags used by at least one task, for suggestions and the filter. */
  listTags(): Promise<string[]>;
  listProjects(): Promise<Project[]>;
  createProject(name: string): Promise<ProjectResult>;
  deleteProject(id: number): Promise<boolean>;
  /** Wiki notes sorted by title (RF-08), each with its section path; `section` limits to the notes of that folder. */
  listNotes(section?: string): Promise<NoteSummary[]>;
  /** Folders of `wiki/` at any depth (up to 5) with notes, a `_section.md` or folders inside, with the title and order. */
  listSections(): Promise<SectionSummary[]>;
  /** Creates a section folder (inside `input.parent` if given) with its `_section.md`; it shows even before it has pages. */
  createSection(input: SectionInput): Promise<SectionResult>;
  /** Files of `wiki/` left out of the index at the last rebuild, with the reason. */
  listSkippedFiles(): Promise<SkippedFile[]>;
  /** Opens `wiki/` in the system file explorer; main does it, the renderer touches no Node. */
  openWikiFolder(): Promise<boolean>;
  /** Calls `listener` after `wiki/` changed outside the app (index already rebuilt). Returns the unsubscribe. */
  onWikiChanged(listener: () => void): () => void;
  /** A note with its links and backlinks; `slug` is the path of the file inside `wiki/` without `.md`. */
  getNote(slug: string): Promise<NoteResult>;
  createNote(input: NoteInput): Promise<NoteResult>;
  /** Saves content and, if the title changed, renames the note. */
  updateNote(slug: string, input: NoteInput): Promise<NoteResult>;
  /** Moves the note and its `.assets` folder to another section; `null` is the root of `wiki/`. */
  moveNote(slug: string, section: string | null): Promise<NoteResult>;
  /** Deletes the note; with `deleteAttachments` also its `.assets` folder, otherwise that is kept. */
  deleteNote(slug: string, deleteAttachments?: boolean): Promise<boolean>;
  /** Copies a file into the note's `.assets` folder and returns the Markdown link to insert (RF-08). */
  attachFile(input: AttachmentInput): Promise<AttachmentResult>;
  /** An image linked from a note as a `data:` URL; `src` is the link target as written in the note. */
  readAttachment(slug: string, src: string): Promise<AttachmentImageResult>;
  /** Opens a file linked from a note with the system app; main only opens files inside `wiki/`. */
  openAttachment(slug: string, src: string): Promise<boolean>;
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
  /** Project the Tablero last showed; null is "General" (CP-04-12). */
  getBoardProject(): Promise<BoardSelection>;
  setBoardProject(selection: BoardSelection): Promise<BoardSelection>;
  /** Whether the Tablero's side panel of projects is open; open unless folded (CP-04-23). */
  getBoardPanelOpen(): Promise<boolean>;
  setBoardPanelOpen(open: boolean): Promise<boolean>;
  /** How Snippets lays out its cards; a grid unless the user chose the list (CP-13-15). */
  getSnippetsView(): Promise<SnippetsView>;
  setSnippetsView(view: SnippetsView): Promise<SnippetsView>;
  /** Chosen Enfoque duration in minutes, 1 to 180; 25 when unset or invalid (CP-17-19, CP-17-20). */
  getFocusMinutes(): Promise<number>;
  setFocusMinutes(minutes: number): Promise<number>;
  /**
   * Exports everything as a ZIP of open formats (RF-11). Main opens the save dialog; the
   * renderer sends nothing and only gets the outcome.
   */
  exportAll(): Promise<ExportResult>;
}
