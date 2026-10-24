# ADR-001: Local SQLite database and Markdown notes

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

The app must work fully offline, without accounts or a server (RNF-02, RNF-03), behave
the same on Windows and Fedora (RNF-12), and let the user move or back up all their
data easily (RNF-04, RNF-13). Search must stay near-instant with years of data (RNF-05).

## Decision

- Tasks, bugs, tags, journal entries, snippets and the search index live in a single
  SQLite file (`datos.db`) accessed with `better-sqlite3`.
- The database runs in WAL mode; multi-row writes use transactions (RNF-08).
- Global search uses an FTS5 index.
- Each note is a Markdown file with YAML frontmatter under `wiki/`. SQLite only
  indexes notes; the files are the source of truth.
- Schema changes are versioned migrations applied at startup.

Data folder:

```
OrquestadorPlus/
├── datos.db
└── wiki/
    ├── nota.md
    ├── nota.assets/        images and files attached to nota.md
    └── Sección/
        ├── otra.md
        ├── otra.assets/
        └── Subsección/     folders nest up to 5 levels (ADR-005)
            └── nota.md
```

Attachments live next to their note, in a folder named `<note>.assets/`, and are linked from
the note with plain Markdown (`![captura](nota.assets/captura.png)`), so the wiki stays readable
by Obsidian, Typora and AI tools. Renaming a note renames its folder; exporting includes the
folders. Each attachment is limited to 10 MB.

## Alternatives considered

| Option | Advantage | Problem |
| --- | --- | --- |
| SQLite (chosen) | One file, no server, same format on every OS | Single writer at a time |
| Plain files only | Easy to version with Git | Slow search without an index |
| PostgreSQL | More powerful | Requires installing and running a server |

## Consequences

- A full backup is copying the data folder.
- Deleting `datos.db` keeps the notes; the index can be rebuilt from `wiki/`.
- `better-sqlite3` is a native module: CI must package the app on every target OS to
  catch rebuild failures.
