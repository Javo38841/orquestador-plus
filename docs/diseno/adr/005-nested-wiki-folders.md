# ADR-005: Nested wiki folders

- **Status:** Accepted
- **Date:** 2026-10-24
- **Supersedes:** the "one level of sections" rule of the wiki sidebar (stories #62 and #76)

## Context

Sections were the folders directly under `wiki/`; anything deeper was ignored. Notes that
the user, Obsidian or an AI tool create in subfolders (`Proyectos/OrquestadorPlus/Decisiones/adr-001.md`)
"disappeared" from the app. The index also assumed that a note's file name and title were unique
in the whole wiki, which makes no sense once two folders can hold a `README`.

## Decision

- **Any depth up to 5 folders.** A section is any folder below `wiki/` at depth 1 to 5. Creating a
  section deeper than that is rejected with an error. When indexing, a folder deeper than the limit
  is not loaded, but it is reported as `too_deep` with its path and the UI shows it in Spanish in
  the list of skipped files, so nothing is lost in silence. The limit is `MAX_SECTION_DEPTH`
  in `src/shared/wiki.ts`.
- **A note is identified by its path.** `slug` is the path of its file inside `wiki/` without `.md`
  (`Proyectos/OrquestadorPlus/Decisiones/adr-001`) and `section` is the path of its folder. Notes in
  the root and in one folder keep exactly the slug they had, so existing wikis, links and search
  results keep working. Folders and note names are validated per part: no `..`, no absolute paths,
  no backslashes, no empty parts, no reserved names.
- **Uniqueness is per folder.** A title and a file name must be unique inside their folder; the same
  name in two folders is valid. Migration 19 replaces the unique index on `title_key` with one on
  `(section, title_key)`. While indexing, a duplicate inside the same folder is skipped as before.
- **`[[links]]` resolution.** A link is resolved by title, ignoring case and spacing. If several notes
  share that title, the one **closest to the root** wins, and among equals the first by path. To
  point at a specific one the link may carry its folder path: `[[Proyectos/Decisiones/ADR-001]]`
  (folder names, then title) or the file path (`[[Proyectos/Decisiones/adr-001]]`). Backlinks use
  the same rule: a note is a backlink of another only if its link resolves to it.
- **`_section.md`** gives a folder its title and order at every level. A folder appears in the
  sidebar if it has notes, a `_section.md`, or any folder inside it that does; without
  `_section.md` it is titled with its folder name.
- **Order for Anterior / Siguiente and the sidebar:** at each level, the pages of the folder first and
  then its folders, each by `order` and then by name, depth first.
- **Security.** Main builds every path from validated parts and checks, with `realpath`, that the
  result stays inside `wiki/`. Symbolic links to folders or files are not followed at any depth. A new
  section needs an existing parent folder, creates only its own folder and removes it again if
  writing its `_section.md` fails.

## Consequences

- The IPC identifies notes by path: `slug` may contain `/`. `createSection` takes an optional `parent`.
- Attachments stay next to the note (`<note>.assets/`); links to them use only the file name part.
- Renaming, moving and deleting folders remain out of scope.
