import { TestBed } from '@angular/core/testing';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type { Note, NoteResult } from '../../../../shared/wiki';
import { DESKTOP_API } from '../../core/desktop-api';
import { WikiStore } from './wiki.store';

const note = (slug: string, content = ''): Note => ({
  slug,
  title: slug,
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
  content,
  links: [],
  backlinks: [],
});

function setup(result: NoteResult = { ok: true, note: note('A') }) {
  const api = {
    listNotes: vi.fn(async () => [note('A'), note('Guía de B')]),
    getNote: vi.fn(async () => result),
    createNote: vi.fn(async () => result),
    updateNote: vi.fn(async () => result),
    deleteNote: vi.fn(async () => true),
  };
  TestBed.configureTestingModule({
    providers: [{ provide: DESKTOP_API, useValue: api as unknown as OrquestadorApi }],
  });
  return { store: TestBed.inject(WikiStore), api };
}

describe('WikiStore', () => {
  it('loads notes and maps normalized titles to slugs', async () => {
    const { store } = setup();
    await store.load();
    expect(store.notes()).toHaveLength(2);
    expect(store.slugByKey().get('guía de b')).toBe('Guía de B');
  });

  it('CP-08-09: validates locally before calling the API', async () => {
    const { store, api } = setup();
    expect(await store.create({ title: '  ', content: '' })).toBe('empty');
    expect(await store.save('A', { title: '', content: '' })).toBe('empty');
    expect(api.createNote).not.toHaveBeenCalled();
    expect(api.updateNote).not.toHaveBeenCalled();
  });

  it('creates a note, opens it and refreshes the list', async () => {
    const { store, api } = setup();
    expect(await store.create({ title: ' A ', content: 'x' })).toBeNull();
    expect(api.createNote).toHaveBeenCalledWith({ title: 'A', content: 'x' });
    expect(store.current()?.slug).toBe('A');
    expect(store.notes()).toHaveLength(2);
  });

  it('CP-08-06: returns the duplicate error and keeps the open note', async () => {
    const { store } = setup({ ok: false, error: 'duplicate' });
    expect(await store.create({ title: 'A', content: '' })).toBe('duplicate');
    expect(store.current()).toBeNull();
  });

  it('saves, opens and removes a note', async () => {
    const { store, api } = setup({ ok: true, note: note('A', 'nuevo') });
    expect(await store.save('A', { title: 'A', content: 'nuevo' })).toBeNull();
    expect(api.updateNote).toHaveBeenCalledWith('A', { title: 'A', content: 'nuevo' });
    expect(store.current()?.content).toBe('nuevo');
    await store.remove('A');
    expect(api.deleteNote).toHaveBeenCalledWith('A');
    expect(store.current()).toBeNull();
  });

  it('reports not_found when opening a note that disappeared', async () => {
    const { store } = setup({ ok: false, error: 'not_found' });
    expect(await store.openNote('Z')).toBe('not_found');
    expect(store.current()).toBeNull();
  });
});
