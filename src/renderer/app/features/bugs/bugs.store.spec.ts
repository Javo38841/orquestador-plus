import { TestBed } from '@angular/core/testing';
import type { Bug, BugInput, BugResult } from '../../../../shared/bugs';
import type { OrquestadorApi } from '../../../../shared/ipc';
import { DESKTOP_API } from '../../core/desktop-api';
import { BugsStore } from './bugs.store';

const bug = (id: number, status: Bug['status'] = 'new'): Bug => ({
  id,
  code: `BUG-${id}`,
  title: `bug ${id}`,
  symptom: '',
  impact: '',
  rootCause: '',
  solution: '',
  severity: 'medium',
  status,
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
});

const input: BugInput = {
  title: 'Nuevo',
  symptom: '',
  impact: '',
  rootCause: '',
  solution: '',
  severity: 'medium',
};

function setup(stored: Bug[] = []) {
  const createBug = vi.fn(async (): Promise<BugResult> => ({ ok: true, bug: bug(99) }));
  const updateBug = vi.fn(async (id: number): Promise<BugResult> => ({ ok: true, bug: bug(id) }));
  const setBugStatus = vi.fn(async (id: number, status: Bug['status']): Promise<BugResult> => ({
    ok: true,
    bug: bug(id, status),
  }));
  const deleteBug = vi.fn(async () => true);
  const api = {
    listBugs: async () => stored,
    createBug,
    updateBug,
    setBugStatus,
    deleteBug,
  } as unknown as OrquestadorApi;
  TestBed.configureTestingModule({ providers: [{ provide: DESKTOP_API, useValue: api }] });
  return { store: TestBed.inject(BugsStore), createBug, updateBug, setBugStatus, deleteBug };
}

describe('BugsStore', () => {
  it('loads bugs', async () => {
    const { store } = setup([bug(2), bug(1)]);
    await store.load();
    expect(store.bugs()).toHaveLength(2);
  });

  it('CP-09-01: a created bug goes first', async () => {
    const { store, createBug } = setup([bug(1)]);
    await store.load();
    expect(await store.create(input)).toBeNull();
    expect(createBug).toHaveBeenCalledWith(input);
    expect(store.bugs()[0].id).toBe(99);
  });

  it('CP-09-04: an empty title is rejected without calling the API', async () => {
    const { store, createBug, updateBug } = setup();
    expect(await store.create({ ...input, title: '   ' })).toBe('empty');
    expect(await store.update(1, { ...input, title: '' })).toBe('empty');
    expect(createBug).not.toHaveBeenCalled();
    expect(updateBug).not.toHaveBeenCalled();
    expect(store.bugs()).toEqual([]);
  });

  it('CP-09-05: an edited bug replaces the one in the list', async () => {
    const { store, updateBug } = setup([bug(1), bug(2)]);
    await store.load();
    updateBug.mockResolvedValueOnce({ ok: true, bug: { ...bug(1), symptom: 'nuevo' } });
    expect(await store.update(1, input)).toBeNull();
    expect(store.bugs().find((b) => b.id === 1)?.symptom).toBe('nuevo');
  });

  it('CP-09-10: the open count follows status changes', async () => {
    const { store, setBugStatus } = setup([bug(1), bug(2, 'analysis'), bug(3, 'verified')]);
    await store.load();
    expect(store.openCount()).toBe(2);

    await store.setStatus(1, 'resolved');
    expect(setBugStatus).toHaveBeenCalledWith(1, 'resolved');
    expect(store.openCount()).toBe(1);

    await store.setStatus(3, 'analysis');
    expect(store.openCount()).toBe(2);
  });

  it('CP-09-11: deleting removes the bug from the list', async () => {
    const { store, deleteBug } = setup([bug(1), bug(2)]);
    await store.load();
    await store.remove(1);
    expect(deleteBug).toHaveBeenCalledWith(1);
    expect(store.bugs().map((b) => b.id)).toEqual([2]);
  });

  it('keeps the bug when main refuses to delete it', async () => {
    const { store, deleteBug } = setup([bug(1)]);
    await store.load();
    deleteBug.mockResolvedValueOnce(false);
    await store.remove(1);
    expect(store.bugs()).toHaveLength(1);
  });
});
