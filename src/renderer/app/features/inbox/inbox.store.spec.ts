import { TestBed } from '@angular/core/testing';
import type { CaptureResult, InboxItem } from '../../../../shared/inbox';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type { Task, TaskResult } from '../../../../shared/tasks';
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
  const convertInboxItem = vi.fn(async (): Promise<TaskResult> => ({
    ok: true,
    task: {} as Task,
  }));
  const discardInboxItem = vi.fn(async () => true);
  const api = {
    listInbox: async () => stored,
    captureInbox,
    convertInboxItem,
    discardInboxItem,
  } as unknown as OrquestadorApi;
  TestBed.configureTestingModule({ providers: [{ provide: DESKTOP_API, useValue: api }] });
  return { store: TestBed.inject(InboxStore), captureInbox, convertInboxItem, discardInboxItem };
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

  it('CP-01-09: converting removes the item and sends the captured title', async () => {
    const { store, convertInboxItem } = setup([item(1, 'Revisar logs')]);
    await store.load();
    const input = { title: 'Revisar logs', dueDate: null, projectId: null };
    expect(await store.convert(1, input)).toBeNull();
    expect(convertInboxItem).toHaveBeenCalledWith(1, input);
    expect(store.count()).toBe(0);
  });

  it('CP-01-12: a failed conversion keeps the item', async () => {
    const { store, convertInboxItem } = setup([item(1, 'a')]);
    await store.load();
    convertInboxItem.mockResolvedValueOnce({ ok: false, error: 'invalid_project' });
    expect(await store.convert(1, { title: 'a', dueDate: null, projectId: 7 })).toBe(
      'invalid_project',
    );
    expect(store.count()).toBe(1);
  });

  it('CP-01-10: discarding removes the item', async () => {
    const { store, discardInboxItem } = setup([item(1, 'a'), item(2, 'b')]);
    await store.load();
    await store.discard(1);
    expect(discardInboxItem).toHaveBeenCalledWith(1);
    expect(store.items().map((i) => i.id)).toEqual([2]);
  });
});
