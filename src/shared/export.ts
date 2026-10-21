/** Why an export did not produce a file. */
export type ExportError = 'cancelled' | 'write_failed';

/**
 * Outcome of "Exportar todo" (RF-11). `path` is only text for the UI to show: the renderer
 * has no filesystem access, and the folder and name were chosen in a dialog opened by main.
 */
export type ExportResult = { ok: true; path: string } | { ok: false; error: ExportError };
