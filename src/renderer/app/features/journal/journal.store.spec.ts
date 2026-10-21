import { TestBed } from '@angular/core/testing';
import type { JournalEntry, JournalResult } from '../../../../shared/journal';
import type { OrquestadorApi } from '../../../../shared/ipc';
import { DESKTOP_API } from '../../core/desktop-api';
import { JournalStore } from './journal.store';

const entry = (date: string, text = 't'): JournalEntry => ({ date, text, updatedAt: '' });

function setup(stored: JournalEntry[] = [], result?: JournalResult) {
  const saveJournalEntry = vi.fn(
    async (date: string, text: string): Promise<JournalResult> =>
      result ?? { ok: true, entry: text.trim() ? entry(date, text) : null },
  );
  const api = { listJournal: async () => stored, saveJournalEntry };
  TestBed.configureTestingModule({
    providers: [{ provide: DESKTOP_API, useValue: api as unknown as OrquestadorApi }],
  });
  return { store: TestBed.inject(JournalStore), saveJournalEntry };
}

describe('JournalStore', () => {
  it('loads entries newest first', async () => {
    const { store } = setup([entry('2026-01-01'), entry('2026-02-01')]);
    await store.load();
    expect(store.entries().map((e) => e.date)).toEqual(['2026-02-01', '2026-01-01']);
  });

  it('adds a new entry and replaces an existing one keeping the order', async () => {
    const { store } = setup([entry('2026-01-01', 'a')]);
    await store.load();
    expect(await store.save('2026-02-01', 'b')).toBeNull();
    expect(await store.save('2026-01-01', 'c')).toBeNull();
    expect(store.entries().map((e) => [e.date, e.text])).toEqual([
      ['2026-02-01', 'b'],
      ['2026-01-01', 'c'],
    ]);
  });

  it('removes the entry when the text is blank', async () => {
    const { store } = setup([entry('2026-01-01')]);
    await store.load();
    expect(await store.save('2026-01-01', '  ')).toBeNull();
    expect(store.entries()).toEqual([]);
  });

  it('does not call the API with an invalid date', async () => {
    const { store, saveJournalEntry } = setup();
    expect(await store.save('hoy', 'x')).toBe('invalid');
    expect(saveJournalEntry).not.toHaveBeenCalled();
  });

  it('returns the error reported by main and keeps the list', async () => {
    const { store } = setup([entry('2026-01-01')], { ok: false, error: 'too_long' });
    await store.load();
    expect(await store.save('2026-01-01', 'x')).toBe('too_long');
    expect(store.entries()).toHaveLength(1);
  });
});
