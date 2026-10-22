import { describe, expect, it } from 'vitest';
import {
  buildWikiTree,
  extractLinks,
  isValidSection,
  isValidSlug,
  noteKey,
  parseMarkdown,
  slugFromTitle,
  validateNoteInput,
  type NoteSummary,
  type SectionSummary,
} from './wiki';

describe('wiki shared helpers', () => {
  it('CP-08-05: extractLinks dedupes ignoring case and skips code', () => {
    const links = extractLinks('[[A]] [[a ]] `[[x]]`\n```\n[[y]]\n```\n[[Z z]]');
    expect(links).toEqual([
      { label: 'A', key: 'a' },
      { label: 'Z z', key: 'z z' },
    ]);
  });

  it('CP-08-06: slugFromTitle strips separators, traversal and reserved names', () => {
    expect(slugFromTitle('../../x')).toBe('x');
    expect(slugFromTitle('a/b\\c:d')).toBe('a-b-c-d');
    expect(slugFromTitle('...')).toBe('nota');
    expect(slugFromTitle('nul')).toBe('nul-nota');
    expect(slugFromTitle('x'.repeat(300))).toHaveLength(100);
    expect(isValidSlug(slugFromTitle('a..b/..'))).toBe(true);
  });

  it('CP-08-09: isValidSlug and validateNoteInput reject bad payloads', () => {
    for (const slug of ['..', 'a/../b', 'a/b', 'a\\b', ' a', '', 3]) {
      expect(isValidSlug(slug)).toBe(false);
    }
    expect(isValidSlug('Guía 1')).toBe(true);
    expect(validateNoteInput({ title: ' ', content: '' })).toEqual({ ok: false, error: 'empty' });
    expect(validateNoteInput({ title: 'x', content: 1 })).toEqual({ ok: false, error: 'invalid' });
    expect(validateNoteInput({ title: ' x ', content: '' })).toEqual({
      ok: true,
      title: 'x',
      content: '',
    });
  });

  it('noteKey normalizes case and spaces', () => {
    expect(noteKey('  Hola   Mundo ')).toBe('hola mundo');
  });

  it('parseMarkdown builds blocks and inline links without HTML', () => {
    const blocks = parseMarkdown(
      '# Título\n\nTexto con [[B]] y **fuerte** y `code`.\n\n- uno\n- dos\n\n```\n<b>x</b>\n```',
    );
    expect(blocks[0]).toEqual({
      type: 'heading',
      level: 1,
      inline: [{ type: 'text', text: 'Título' }],
    });
    expect(blocks[1]).toMatchObject({ type: 'paragraph' });
    expect(blocks[1].type === 'paragraph' && blocks[1].inline.map((i) => i.type)).toEqual([
      'text',
      'link',
      'text',
      'strong',
      'text',
      'code',
      'text',
    ]);
    expect(blocks[2]).toMatchObject({ type: 'list', ordered: false });
    expect(blocks[3]).toEqual({ type: 'code', text: '<b>x</b>' });
  });
});

describe('wiki tree', () => {
  const note = (slug: string, section?: string, order?: number): NoteSummary => ({
    slug,
    title: slug,
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
    ...(section !== undefined && { section }),
    ...(order !== undefined && { order }),
  });

  it('CP-08-21: sections and pages follow their order; the rest go last by name', () => {
    const sections: SectionSummary[] = [
      { name: 'Aprendizaje', title: 'Aprendizaje', order: 4 },
      { name: 'Empezar', title: 'Empezar', order: 1 },
      { name: 'Guías', title: 'Guías', order: 3 },
      { name: 'Decisiones', title: 'Decisiones', order: 2 },
    ];
    const notes = [
      note('zeta', 'Empezar'),
      note('beta', 'Empezar', 2),
      note('alfa', 'Empezar', 1),
      note('adr', 'Decisiones'),
      note('x', 'Zona'),
      note('b', 'Archivo'),
      note('suelta-b'),
      note('suelta-a'),
      note('g', 'Guías'),
      note('l', 'Aprendizaje'),
    ];
    const tree = buildWikiTree(notes, sections);

    expect(tree.sections.map((s) => s.name)).toEqual([
      'Empezar',
      'Decisiones',
      'Guías',
      'Aprendizaje',
      'Archivo',
      'Zona',
    ]);
    expect(tree.sections[0].pages.map((p) => p.slug)).toEqual(['alfa', 'beta', 'zeta']);
    expect(tree.pages.map((p) => p.slug)).toEqual(['suelta-a', 'suelta-b']);
  });

  it('CP-08-21: an empty wiki gives an empty tree', () => {
    expect(buildWikiTree([], [])).toEqual({ pages: [], sections: [] });
  });

  it('CP-08-25: isValidSection accepts one folder name only', () => {
    for (const ok of ['Guías', 'Empezar aquí', 'a.b']) expect(isValidSection(ok)).toBe(true);
    for (const bad of [
      '..',
      'a/b',
      'a\\b',
      '/abs',
      'C:x',
      '',
      ' x',
      '.git',
      '_section',
      'nul',
      'x.',
      1,
      null,
    ]) {
      expect(isValidSection(bad)).toBe(false);
    }
    expect(validateNoteInput({ title: 'T', content: '', section: '..' })).toEqual({
      ok: false,
      error: 'invalid',
    });
  });
});
