# OrquestadorPlus

Personal command center for developers: tasks, bugs, notes and a dev journal, stored
locally and fully offline. Electron desktop app for Windows 10/11 and Fedora.

Product definition, requirements (RF/RNF) and screen traceability:
`docs/definicion-del-proyecto.md`. Screen mockups: `docs/diseno/pantallas.pdf`.
Architecture decisions: `docs/diseno/adr/`.

## Structure

```
src/main/       Electron main process: SQLite, migrations, IPC handlers,
                reminders, local report portal (HTTP server)
src/preload/    contextBridge — the only API the UI can call
src/shared/     IPC contracts and types shared by main and renderer
src/renderer/   Angular app (standalone components, Signals)
locales/        UI strings (es.json) loaded by Transloco
e2e/            Playwright tests that launch the packaged Electron app
docs/           Product docs (Spanish) and ADRs (English)
.claude/agents/ planner, dev, reviewer (see "Agent orchestration")
.github/        CI, Dev build, release and agent workflows; issue templates
```

## Stack

- **Desktop:** Electron, `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`. The UI is served through the custom `app://` protocol (ADR-003).
- **UI:** Angular, standalone components, Signals, Tailwind CSS.
- **Data:** `better-sqlite3` in WAL mode, versioned migrations, FTS5 for global
  search. Notes are Markdown files with frontmatter (ADR-001).
- **i18n:** Transloco with `locales/es.json`. No user-facing string is hardcoded in
  components or main-process code (RNF-16).
- **Tests:** Vitest (unit, main and renderer) and Playwright `_electron` (E2E).
- **Packaging:** electron-builder — NSIS (Windows), AppImage and RPM (Fedora).

## Language

- Code, identifiers, comments, commits, PRs and technical docs (this file, ADRs): **English** (RNF-15).
- UI text, user-facing messages, issues and product docs: **Spanish** (RNF-14).

## Branches and environments

- `develop` (default branch): integration. Every merge publishes the **Dev build**
  ("OrquestadorPlus Dev") to the `dev-latest` pre-release.
- `main`: production. Only receives PRs from `develop` or `hotfix/*`, merged by the
  owner. A `vX.Y.Z` tag on `main` publishes the installers.
- Dev and production builds use different `appId`, product name and user data
  folder, so they can be installed side by side and **never share a database**.
  The Dev build shows a "DEV" banner.
- Branch name = Conventional Commit type: `feat/`, `fix/`, `test/`, `docs/`,
  `refactor/`, `chore/`, `ci/`. They branch from `develop` and return by PR.
  `hotfix/<bug>` branches from `main` and returns to `main` and `develop`.
- Commits follow Conventional Commits, small and atomic. Merge strategy: squash into
  `develop`, merge commit from `develop` into `main`.

## Agent orchestration

Three agents run in GitHub Actions (`anthropics/claude-code-action`), each with its
own GitHub App identity. The owner only acts at the two ends: approving what gets
built and promoting `develop` to `main`.

1. **planner** (`agent-planner.yml`, `orquestador-dev` app): an issue labeled `idea`
   by the owner is rewritten as a story with `CP-nn-mm` criteria, labeled `por-aprobar`.
2. The owner approves the story by labeling it `en-cola` (or `agente` to start now).
3. **queue** (`agent-queue.yml`): when nothing is in progress, the oldest `en-cola`
   story gets `agente`. It runs after every merge to `develop` and hourly. It pauses
   while anything is labeled `necesita-humano`.
4. **dev** (`agent-dev.yml`, `orquestador-dev` app): labels the story `en-progreso`,
   creates a branch, writes tests first, implements, runs the checks, commits and
   opens a PR to `develop` with `Refs #N`. Instructions: `.claude/agents/dev.md`.
5. CI runs on Linux.
6. **reviewer** (`agent-review.yml`, `orquestador-review` app): a red CI goes back to
   dev as "changes requested"; a green CI gets a read-only review
   (`.claude/agents/reviewer.md`) that approves and squash-merges, or requests changes.
   After 3 rounds with changes requested the PR is labeled `necesita-humano`.
7. The merged story is labeled `en-develop`. The owner tests the Dev build and closes it.

Labels: `idea`, `por-aprobar`, `en-cola`, `agente`, `en-progreso`, `en-develop`,
`necesita-humano`, `story`, `bug`.

Guardrails: agent workflows only run for the owner or the two app bots; the dev app
has no `workflows` permission, so agents cannot edit CI; agent PRs touching `.github/`
or `.claude/` are never auto-approved; every run has a timeout.

## Rules for Claude Code in interactive sessions

- On the owner's request, Claude Code runs commits, pushes, PRs and merges itself in
  this repo, following the same branch and PR flow as everyone else.
- No Claude attribution (`Co-Authored-By`, "Generated with Claude Code") in commits or
  PRs, local or from agents.

## How an agent works on a story

1. **Context.** Read the issue (`gh issue view <N>`): story, `CP-nn-mm` criteria and
   notes. Read the ADRs that apply.
2. **Branch.** Work only on the current branch. Never create worktrees or directories
   outside the repo.
3. **Tests first (ATDD).** At least one test per `CP` whose name starts with its ID
   (`it('CP-03-02: …')`; `CP-N05-01` for an RNF story), in the layer the criterion
   declares (_unit_, _E2E_, _CI_, _manual_). Then the code that makes them pass. Every service or component with
   logic also gets its own `*.spec.ts`, whether or not a `CP` asks for it.
4. **Verify.** Run lint, type-check, unit tests and build, and report the real output.
5. **Report.** Table `CP | test (file and name) | result`, plus anything left as
   _manual_.

If a criterion is ambiguous, has no layer, or misses an obvious edge case, say so
instead of deciding: the owner validates criteria.

## Rules by area

- **IPC:** the renderer never touches Node, the filesystem or SQLite directly. Every
  capability is a typed channel defined in `src/shared/` and exposed by the preload.
  Main validates every IPC payload.
- **Data:** every schema change is a new migration; never edit an applied one. Writes
  that touch more than one row run in a transaction (RNF-08).
- **Portal (RF-15):** only accepts `POST` of new reports into the inbox, with a
  per-link token and expiry. It never reads or modifies other data (RNF-07).
- **Privacy:** no network calls to third parties (RNF-01). No telemetry.
- **Secrets:** never commit secrets. Only `.env.example` is versioned.

## Commands

```
npm run dev            # ng serve + esbuild watch + Electron pointing at localhost:4200
npm run lint           # ESLint (TS, Angular templates, renderer import boundaries)
npm run format:check   # Prettier --check
npm run typecheck      # tsc for renderer, renderer specs and electron code
npm run test:main      # Vitest for src/main, run inside Electron's Node (native ABI)
npm run test:renderer  # Vitest via ng test
npm run build          # Angular + esbuild bundles into dist/ (Dev channel by default)
npm run package:dir    # unpacked Dev build in release/ (what E2E launches)
npm run e2e            # Playwright against the packaged app
```

The build channel comes from `ORQ_CHANNEL` (`prod` or anything else = `dev`). Only
`release.yml` builds `prod`. E2E and local runs use a throwaway data folder through
`ORQ_DATA_DIR`, never the real one.

## Testing

- **Main process unit tests** (`src/main/**/*.spec.ts`): real SQLite (in memory or a
  temp folder), Electron APIs mocked with `vi.mock('electron')`.
- **Renderer unit tests** (`src/renderer/**/*.spec.ts`): TestBed, with `DESKTOP_API`
  provided as a fake. Never call `window.orquestador` directly.
- **E2E** (`e2e/`): launch the packaged app with `launchApp()`. Only when a criterion
  marked _E2E_ asks for it, plus the smoke tests.

## CI/CD

- `ci.yml` (every PR to `develop` or `main`): lint, format, type-check, unit tests,
  build, `package:dir` and E2E. PRs to `develop` run on Linux only (required check:
  `Linux`). PRs to `main` also run on Windows (RNF-12) and need `Source branch` (only
  `develop` or `hotfix/*`).
- `dev-build.yml` (push to `develop`): Linux Dev installers to the `dev-latest`
  pre-release.
- `release.yml` (tag `vX.Y.Z` on `main`, matching `package.json`): production
  installers into a draft release.
