# ADR-003: `app://` protocol and IPC security

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

Loading the built UI from `file://` breaks Angular's router on reload and gives the
page broad filesystem access. The renderer must never reach Node, the filesystem or
the database directly.

## Decision

- The production renderer is served through a custom privileged `app://` protocol
  that only serves files from the bundled renderer folder.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- The preload exposes a single typed API through `contextBridge`. Each capability is
  an IPC channel declared in `src/shared/`, and main validates every payload.
- A strict Content Security Policy blocks remote scripts and connections (RNF-01).
- New windows and navigation to external URLs are blocked; external links open in the
  system browser.

## Consequences

- Adding a feature means adding an IPC contract, a handler in main and a call in the
  renderer.
- The reviewer agent checks every new channel for input validation.
