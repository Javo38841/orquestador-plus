import { TestBed } from '@angular/core/testing';
import type { CaptureResult, InboxItem } from '../../../../shared/inbox';
import type { OrquestadorApi } from '../../../../shared/ipc';
import { DESKTOP_API } from '../../core/desktop-api';
import { InboxStore } from './inbox.store';

const item = (id: number, title: string): InboxItem => ({
  id,
  title,
  source: 'quick_capture',
  createdAt: '2026-03-01T10:00:00.000Z',
});

function setup(stored: InboxItem[] = []) {
  const captureInbox = vi.fn(async (text: string): Promise<CaptureResult> => ({
    ok: true,
    item: item(99, text),
  }));
  const api = {
    listInbox: async () => stored,
    captureInbox,
  } as unknown as OrquestadorApi;
  TestBed.configureTestingModule({ providers: [{ provide: DESKTOP_API, useValue: api }] });
  return { store: TestBed.inject(InboxStore), captureInbox };
}

describe('InboxStore', () => {
  it('loads items and counts them', async () => {
    const { store } = setup([item(2, 'b'), item(1, 'a')]);
    await store.load();
    expect(store.count()).toBe(2);
  });

  it('CP-01-01: a captured item goes first and raises the count by one', async () => {
    const { store, captureInbox } = setup([item(1, 'old')]);
    await store.load();

    const error = await store.capture('  Comprar cable USB-C ');

    expect(error).toBeNull();
    expect(captureInbox).toHaveBeenCalledWith('Comprar cable USB-C');
    expect(store.items()[0].title).toBe('Comprar cable USB-C');
    expect(store.count()).toBe(2);
  });

  it('CP-01-04: empty text is rejected without calling the API', async () => {
    const { store, captureInbox } = setup();
    expect(await store.capture('   ')).toBe('empty');
    expect(captureInbox).not.toHaveBeenCalled();
    expect(store.count()).toBe(0);
  });

  it('CP-01-05: text over 500 characters is rejected without calling the API', async () => {
    const { store, captureInbox } = setup();
    expect(await store.capture('a'.repeat(501))).toBe('too_long');
    expect(captureInbox).not.toHaveBeenCalled();
  });
});
