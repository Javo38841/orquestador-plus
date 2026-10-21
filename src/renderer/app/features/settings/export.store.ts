import { inject, Injectable, signal } from '@angular/core';
import type { ExportError } from '../../../../shared/export';
import { DESKTOP_API } from '../../core/desktop-api';

export type ExportState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; path: string }
  | { kind: 'failed'; error: ExportError };

@Injectable({ providedIn: 'root' })
export class ExportStore {
  private readonly api = inject(DESKTOP_API);
  private readonly current = signal<ExportState>({ kind: 'idle' });

  readonly state = this.current.asReadonly();

  async exportAll(): Promise<void> {
    if (!this.api || this.current().kind === 'running') return;
    this.current.set({ kind: 'running' });
    try {
      const result = await this.api.exportAll();
      this.current.set(
        result.ok ? { kind: 'done', path: result.path } : { kind: 'failed', error: result.error },
      );
    } catch {
      this.current.set({ kind: 'failed', error: 'write_failed' });
    }
  }
}
