import { TestBed } from '@angular/core/testing';
import type { ExportResult } from '../../../../shared/export';
import type { OrquestadorApi } from '../../../../shared/ipc';
import { DESKTOP_API } from '../../core/desktop-api';
import { ExportStore } from './export.store';

function setup(exportAll: () => Promise<ExportResult>) {
  TestBed.configureTestingModule({
    providers: [{ provide: DESKTOP_API, useValue: { exportAll } as unknown as OrquestadorApi }],
  });
  return TestBed.inject(ExportStore);
}

describe('ExportStore', () => {
  it('starts idle and reports the saved location on success', async () => {
    const store = setup(async () => ({ ok: true, path: '/tmp/a.zip' }));
    expect(store.state()).toEqual({ kind: 'idle' });
    await store.exportAll();
    expect(store.state()).toEqual({ kind: 'done', path: '/tmp/a.zip' });
  });

  it('CP-11-08: a cancel or a failed write is reported as such', async () => {
    const cancelled = setup(async () => ({ ok: false, error: 'cancelled' }));
    await cancelled.exportAll();
    expect(cancelled.state()).toEqual({ kind: 'failed', error: 'cancelled' });
  });

  it('CP-11-08: a rejected IPC call is shown as a write failure', async () => {
    const store = setup(async () => {
      throw new Error('boom');
    });
    await store.exportAll();
    expect(store.state()).toEqual({ kind: 'failed', error: 'write_failed' });
  });

  it('ignores a second click while an export is running', async () => {
    let release!: (r: ExportResult) => void;
    const exportAll = vi.fn(() => new Promise<ExportResult>((resolve) => (release = resolve)));
    const store = setup(exportAll);
    const first = store.exportAll();
    await store.exportAll();
    expect(exportAll).toHaveBeenCalledTimes(1);
    release({ ok: true, path: 'x' });
    await first;
  });
});
