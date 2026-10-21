# ADR-004: Agent orchestration on GitHub Actions

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

The project has a single human owner. Feature work up to `develop` should run without
manual steps, while promotion to production stays a human decision. The repository is
public.

## Decision

- Three agents (planner, dev, reviewer) run in GitHub Actions with
  `anthropics/claude-code-action`, authenticated with the owner's Claude token.
- Two GitHub Apps provide the identities:
  - `orquestador-dev`: planner and dev. Contents, pull requests and issues write.
    **No `workflows` permission.**
  - `orquestador-review`: reviewer. Pull requests and issues write, contents write
    (required to merge), checks read.
- Two identities are required because GitHub does not let a PR author approve their
  own PR, and PRs opened with the default `GITHUB_TOKEN` do not trigger other workflows.
- Flow: `idea` label → planner → `por-aprobar` → owner adds `agente` → dev opens PR →
  CI (Linux; Windows only on PRs to `main`) → reviewer approves and merges, or
  requests changes (max 3 rounds, then `necesita-humano`).
- Rulesets: `develop` requires the `Linux` check and one approval. `main` requires
  `Linux`, `Windows` and `Source branch`, so it only accepts PRs from `develop` or
  `hotfix/*`.
- No self-hosted runner: public repositories get unlimited GitHub-hosted minutes, and
  a self-hosted runner on a public repo would let fork PRs run code on the homelab.

## Guardrails

- Agent workflows run only when the triggering actor is the owner.
- Agents cannot modify `.github/workflows`, so they cannot weaken CI to pass.
- Each run has a timeout and a bounded number of review rounds.
- Commits and PRs carry no Claude attribution; they are authored by the app bots.

## Consequences

- Each agent run consumes the owner's Claude plan usage.
- The owner keeps two touch points: approving stories and merging `develop` into `main`.
