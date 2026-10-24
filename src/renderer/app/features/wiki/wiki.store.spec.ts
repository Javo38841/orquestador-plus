import { TestBed } from '@angular/core/testing';
import type { AttachmentResult } from '../../../../shared/attachments';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type {
  Note,
  NoteResult,
  SectionResult,
  SectionSummary,
  SkippedFile,
} from '../../../../shared/wiki';
import { DESKTOP_API } from '../../core/desktop-api';
import { WikiStore } from './wiki.store';

const note = (slug: string, content = ''): Note => ({
  slug,
  title: slug,
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
  hash: `hash-${slug}`,
  content,
  links: [],
  backlinks: [],
});

const changed: (() => void)[] = [];

function setup(result: NoteResult = { ok: true, note: note('A') }) {
  const api = {
    listSections: vi.fn(async (): Promise<SectionSummary[]> => []),
    createSection: vi.fn(async (): Promise<SectionResult> => ({
      ok: true,
      section: { name: 'Guías', title: 'Guías' },
    })),
    listNotes: vi.fn(async () => [note('A'), note('Guía de B')]),
    getNote: vi.fn(async () => result),
    createNote: vi.fn(async () => result),
    updateNote: vi.fn(async () => result),
    deleteNote: vi.fn(async () => true),
    attachFile: vi.fn(async (): Promise<AttachmentResult> => ({
      ok: true,
      link: '![a](A.assets/a.png)',
      name: 'a.png',
    })),
    listSkippedFiles: vi.fn(async (): Promise<SkippedFile[]> => []),
    openWikiFolder: vi.fn(async () => true),
    onWikiChanged: vi.fn((listener: () => void) => {
      changed.push(listener);
      return () => changed.splice(changed.indexOf(listener), 1);
    }),
  };
  TestBed.configureTestingModule({
    providers: [{ provide: DESKTOP_API, useValue: api as unknown as OrquestadorApi }],
  });
  changed.length = 0;
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

  it('CP-08-120: attach refuses an empty or oversized file before calling main', async () => {
    const { store, api } = setup();
    expect(await store.attach('A', 'a.png', new Uint8Array(0))).toEqual({
      ok: false,
      error: 'empty',
    });
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    expect(await store.attach('A', 'a.png', big)).toEqual({ ok: false, error: 'too_large' });
    expect(api.attachFile).not.toHaveBeenCalled();
  });

  it('CP-08-122: attach sends the note, name and bytes, and counts the file on the open note', async () => {
    const { store, api } = setup();
    await store.openNote('A');
    const data = new Uint8Array([1, 2]);

    const result = await store.attach('A', 'a.png', data);

    expect(api.attachFile).toHaveBeenCalledWith({ slug: 'A', name: 'a.png', data });
    expect(result).toEqual({ ok: true, link: '![a](A.assets/a.png)', name: 'a.png' });
    expect(store.current()?.attachments).toBe(1);
  });

  it('CP-08-128: remove can ask main to delete the attachments too', async () => {
    const { store, api } = setup();
    await store.remove('A', true);
    expect(api.deleteNote).toHaveBeenCalledWith('A', true);
  });

  it('reports not_found when opening a note that disappeared', async () => {
    const { store } = setup({ ok: false, error: 'not_found' });
    expect(await store.openNote('Z')).toBe('not_found');
    expect(store.current()).toBeNull();
  });

  it('CP-08-67: creates a section with the trimmed name and reloads the tree', async () => {
    const { store, api } = setup();
    api.createSection.mockImplementation(async () => {
      api.listSections.mockResolvedValue([{ name: 'Guías', title: 'Guías' }]);
      return { ok: true, section: { name: 'Guías', title: 'Guías' } };
    });
    expect(await store.createSection('  Guías ')).toBeNull();
    expect(api.createSection).toHaveBeenCalledWith({ title: 'Guías' });
    expect(store.tree().sections.map((s) => s.name)).toEqual(['Guías']);
  });

  it('CP-08-68: rejects empty, unsafe and existing names before calling main', async () => {
    const { store, api } = setup();
    api.listSections.mockResolvedValue([{ name: 'Guías', title: 'Guías' }]);
    await store.load();
    expect(await store.createSection('  ')).toBe('empty');
    expect(await store.createSection('a/b')).toBe('invalid');
    expect(await store.createSection('..')).toBe('invalid');
    expect(await store.createSection('GUÍAS')).toBe('duplicate');
    expect(api.createSection).not.toHaveBeenCalled();

    api.createSection.mockResolvedValue({ ok: false, error: 'duplicate' });
    expect(await store.createSection('Otra')).toBe('duplicate');
  });

  it('CP-08-70: creates a page inside the given section', async () => {
    const { store, api } = setup();
    expect(await store.create({ title: 'Instalación', content: '', section: 'Guías' })).toBeNull();
    expect(api.createNote).toHaveBeenCalledWith({
      title: 'Instalación',
      content: '',
      section: 'Guías',
    });
  });

  describe('nested folders (#89)', () => {
    const at = (slug: string, title: string, section?: string) => ({
      ...note(slug),
      title,
      ...(section !== undefined && { section }),
    });

    it('CP-08-80: the trail has the title of each folder above the open note', async () => {
      const { store, api } = setup({ ok: true, note: at('P/Q/adr', 'ADR-001', 'P/Q') });
      api.listNotes.mockResolvedValue([at('P/Q/adr', 'ADR-001', 'P/Q')]);
      api.listSections.mockResolvedValue([
        { name: 'P', title: 'Proyectos' },
        { name: 'P/Q', title: 'OrquestadorPlus' },
      ]);
      await store.load();
      expect(store.currentTrail()).toEqual([]);

      await store.openNote('P/Q/adr');

      expect(store.currentTrail()).toEqual(['Proyectos', 'OrquestadorPlus']);
    });

    it('CP-08-85: links resolve by title to the closest note, or by path to the exact one', async () => {
      const { store, api } = setup();
      api.listNotes.mockResolvedValue([
        at('A/Dup', 'Dup', 'A'),
        at('B/x/Dup', 'Dup', 'B/x'),
        at('Dup', 'Dup'),
      ]);
      await store.load();

      expect(store.slugByKey().get('dup')).toBe('Dup');
      expect(store.slugByKey().get('a/dup')).toBe('A/Dup');
      expect(store.slugByKey().get('b/x/dup')).toBe('B/x/Dup');
    });

    it('CP-08-81: creates a section inside a parent and reloads', async () => {
      const { store, api } = setup();
      expect(await store.createSection(' Hija ', 'Padre/Hijo')).toBeNull();
      expect(api.createSection).toHaveBeenCalledWith({ title: 'Hija', parent: 'Padre/Hijo' });
      expect(api.listSections).toHaveBeenCalled();
    });

    it('CP-08-83: rejects empty, unsafe, repeated-in-that-folder and too deep names before main', async () => {
      const { store, api } = setup();
      api.listSections.mockResolvedValue([
        { name: 'P', title: 'P' },
        { name: 'P/Sub', title: 'Sub' },
      ]);
      await store.load();

      expect(await store.createSection('', 'P')).toBe('empty');
      expect(await store.createSection('a/b', 'P')).toBe('invalid');
      expect(await store.createSection('..', 'P')).toBe('invalid');
      expect(await store.createSection('sub', 'P')).toBe('duplicate');
      expect(await store.createSection('x', 'a/b/c/d/e')).toBe('too_deep');
      expect(await store.createSection('x', '../y')).toBe('invalid');
      expect(api.createSection).not.toHaveBeenCalled();
      // the same name in another folder is fine
      expect(await store.createSection('Sub', 'Otra')).toBeNull();
      expect(api.createSection).toHaveBeenCalledTimes(1);
    });
  });
});
