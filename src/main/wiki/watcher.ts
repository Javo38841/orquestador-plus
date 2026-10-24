import fs from 'node:fs';
import path from 'node:path';
import { isValidSection, type SkippedFile } from '../../shared/wiki';
import { rebuildIndexReport, type Wiki } from './wiki';

export interface WikiSyncOptions {
  /** Called after an outside change was found and the index rebuilt. */
  onChange: () => void;
  /** Quiet time without events before the index is rebuilt. */
  debounceMs?: number;
  /** A burst that never calms down is flushed after this long anyway. */
  maxWaitMs?: number;
  /** `fs.watch`; injectable for tests. */
  watch?: typeof fs.watch;
}

export interface WikiSync {
  /** Rebuilds the index once and starts watching `wiki/` and its section folders. */
  start(): void;
  /** Releases every watcher and timer. Safe to call twice. */
  stop(): void;
  /**
   * Call after the app itself wrote to `wiki/`: the new state of the disk is taken as known,
   * so the events the write causes are not treated as an outside change.
   */
  markSynced(): void;
  /** Files left out of the index at the last rebuild. */
  skipped(): SkippedFile[];
}

const DEFAULT_DEBOUNCE_MS = 500;
const DEFAULT_MAX_WAIT_MS = 2000;

/** Cheap fingerprint of `wiki/`: its folders and every `.md` with size and mtime. */
export function snapshotWiki(dir: string): string {
  const parts: string[] = [];
  const visit = (folder: string, prefix: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const rel = prefix + entry.name;
      if (entry.isDirectory() && prefix === '' && isValidSection(entry.name)) {
        parts.push(`d:${rel}`);
        visit(path.join(folder, entry.name), `${rel}/`);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        try {
          const stat = fs.statSync(path.join(folder, entry.name));
          parts.push(`f:${rel}:${stat.size}:${stat.mtimeMs}`);
        } catch {
          // vanished between readdir and stat: the next snapshot will not have it
        }
      }
    }
  };
  visit(dir, '');
  return parts.join('\n');
}

/**
 * Keeps the index in step with `wiki/` while the app is open (RF-08): watches the folder and
 * its sections, waits for a quiet moment, and rebuilds the index once if the disk really differs
 * from what the app knows. Idle, it does nothing: no timers, no polling.
 */
export function createWikiSync(wiki: Wiki, options: WikiSyncOptions): WikiSync {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const watch = options.watch ?? fs.watch;
  const watchers = new Map<string, fs.FSWatcher>();
  let timer: NodeJS.Timeout | null = null;
  let burstStart = 0;
  let known = '';
  let skippedFiles: SkippedFile[] = [];
  let running = false;

  const rebuild = (): void => {
    skippedFiles = rebuildIndexReport(wiki).skipped;
    known = snapshotWiki(wiki.dir);
    syncWatchers();
  };

  function syncWatchers(): void {
    if (!running) return;
    const wanted = new Set([wiki.dir]);
    try {
      for (const e of fs.readdirSync(wiki.dir, { withFileTypes: true })) {
        if (e.isDirectory() && isValidSection(e.name)) wanted.add(path.join(wiki.dir, e.name));
      }
    } catch {
      // wiki/ itself is gone; it is recreated by the next rebuild
    }
    for (const [dir, watcher] of watchers) {
      if (wanted.has(dir)) continue;
      watcher.close();
      watchers.delete(dir);
    }
    for (const dir of wanted) {
      if (watchers.has(dir)) continue;
      try {
        const watcher = watch(dir, { persistent: false }, (_event, name) => {
          if (typeof name === 'string' && name.endsWith('.tmp')) return; // the app's own atomic writes
          schedule();
        });
        watcher.on('error', () => {
          watcher.close();
          watchers.delete(dir);
          schedule(); // the folder probably vanished: look again
        });
        watchers.set(dir, watcher);
      } catch {
        // cannot watch this folder (permissions, removed): the others still work
      }
    }
  }

  function schedule(): void {
    if (!running) return;
    const now = Date.now();
    if (timer === null) burstStart = now;
    else clearTimeout(timer);
    const wait = Math.max(0, Math.min(debounceMs, burstStart + maxWaitMs - now));
    timer = setTimeout(flush, wait);
    timer.unref();
  }

  function flush(): void {
    timer = null;
    if (!running) return;
    if (snapshotWiki(wiki.dir) === known) return; // the app's own write, or nothing relevant
    try {
      rebuild();
    } catch {
      return; // a failed rebuild leaves the previous index; the next event retries
    }
    options.onChange();
  }

  return {
    start() {
      if (running) return;
      running = true;
      rebuild();
    },
    stop() {
      running = false;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    },
    markSynced() {
      if (!running) return;
      // Events still waiting may hide an outside change: leave `known` alone so the flush sees it.
      if (timer === null) known = snapshotWiki(wiki.dir);
      syncWatchers(); // a section created by the app needs its own watcher
    },
    skipped: () => skippedFiles,
  };
}
