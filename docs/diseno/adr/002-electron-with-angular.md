# ADR-002: Electron with Angular

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

The app targets Windows 10/11 and Fedora with identical behavior (RNF-12) and must be
installable without technical knowledge (RNF-09). The owner already works with Angular
(standalone components, Signals) in other projects.

## Decision

- Electron for the desktop shell, split into `main`, `preload` and `renderer`.
- Angular for the renderer: standalone components, Signals, Tailwind CSS.
- Main and preload are bundled with esbuild; the renderer with the Angular CLI.
- Transloco for runtime i18n with `locales/es.json` (RNF-16). Angular's built-in i18n
  was discarded because it needs one build per language.
- electron-builder produces NSIS (Windows), AppImage and RPM (Fedora).

## Consequences

- No ready-made Electron + Angular template: the scaffold wires both build pipelines
  and the dev workflow (`ng serve` + Electron pointing at it).
- The renderer is a normal Angular app and can be unit-tested without Electron.
