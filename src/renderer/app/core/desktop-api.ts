import { InjectionToken } from '@angular/core';
import type { OrquestadorApi } from '../../../shared/ipc';

declare global {
  interface Window {
    orquestador?: OrquestadorApi;
  }
}

/**
 * The preload API (ADR-003). Components and services inject this token instead
 * of touching `window` so tests can provide a fake.
 */
export const DESKTOP_API = new InjectionToken<OrquestadorApi | null>('DESKTOP_API', {
  providedIn: 'root',
  factory: () => window.orquestador ?? null,
});
