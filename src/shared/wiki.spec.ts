import { describe, expect, it } from 'vitest';
import {
  buildWikiTree,
  extractLinks,
  extractToc,
  isValidNotePath,
  isValidSection,
  isValidSectionPath,
  isValidSlug,
  linkTargets,
  MAX_SECTION_DEPTH,
  noteKey,
  sectionTrail,
  pageNavigation,
  parseMarkdown,
  slugFromTitle,
  validateNoteInput,
  validateSectionInput,
  type NoteSummary,
  type SectionSummary,
  type WikiTree,
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

describe('wiki markdown extensions', () => {
  it('CP-08-46: :::note, :::tip and :::caution become callouts with their inner blocks', () => {
    const blocks = parseMarkdown(
      ':::note\nTexto con `code` y [[Otra]].\n\n- uno\n- dos\n:::\n\n:::tip[Un consejo]\nHola\n:::\n\n:::caution\nCuidado\n:::',
    );
    expect(blocks).toHaveLength(3);
    const [note, tip, caution] = blocks;
    expect(note).toMatchObject({ type: 'callout', kind: 'note' });
    expect(note.type === 'callout' && note.title).toBeUndefined();
    expect(note.type === 'callout' && note.blocks.map((b) => b.type)).toEqual([
      'paragraph',
      'list',
    ]);
    expect(
      note.type === 'callout' &&
        note.blocks[0].type === 'paragraph' &&
        note.blocks[0].inline.map((i) => i.type),
    ).toEqual(['text', 'code', 'text', 'link', 'text']);
    expect(tip).toMatchObject({ type: 'callout', kind: 'tip', title: 'Un consejo' });
    expect(caution).toMatchObject({ type: 'callout', kind: 'caution' });
  });

  it('CP-08-47: unknown, unclosed and nested callouts stay plain text', () => {
    const unknown = parseMarkdown(':::danger\nx\n:::\n\nDespués');
    expect(unknown.some((b) => b.type === 'callout')).toBe(false);
    expect(unknown.at(-1)).toMatchObject({ type: 'paragraph' });

    const unclosed = parseMarkdown(':::note\nsin cierre\n\nResto');
    expect(unclosed.some((b) => b.type === 'callout')).toBe(false);
    expect(unclosed.at(-1)).toMatchObject({ type: 'paragraph' });

    const nested = parseMarkdown(':::note\n:::tip\ndentro\n:::\n:::\nfin');
    expect(nested[0]).toMatchObject({ type: 'callout', kind: 'note' });
    const inner = nested[0].type === 'callout' ? nested[0].blocks : [];
    expect(inner.some((b) => b.type === 'callout')).toBe(false);
    expect(nested.filter((b) => b.type === 'callout')).toHaveLength(1);
  });

  it('CP-08-48: a code block carries language, title and the exact text', () => {
    const text = 'SELECT *\n  FROM t;\n\n-- fin';
    const [titled] = parseMarkdown('```sql title="consulta.sql"\n' + text + '\n```');
    expect(titled).toEqual({ type: 'code', text, lang: 'sql', title: 'consulta.sql' });
    const [plain] = parseMarkdown('```sql\nSELECT 1\n```');
    expect(plain).toEqual({ type: 'code', text: 'SELECT 1', lang: 'sql' });
    expect(plain).not.toHaveProperty('title');
  });

  it('CP-08-49: unclosed code and odd titles are kept as literal data', () => {
    const [unclosed] = parseMarkdown('```js\nconsole.log(1)');
    expect(unclosed).toEqual({ type: 'code', text: 'console.log(1)', lang: 'js' });
    const [empty] = parseMarkdown('```sql title=""\nx\n```');
    expect(empty).not.toHaveProperty('title');
    const [odd] = parseMarkdown('```sql title="<b>\'a\'</b>"\n<i>x</i>\n```');
    expect(odd).toMatchObject({ title: "<b>'a'</b>", text: '<i>x</i>' });
  });

  it('CP-08-50: a table keeps header, rows and per-column alignment', () => {
    const [table] = parseMarkdown(
      '| A | B | C |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |',
    );
    expect(table.type).toBe('table');
    if (table.type !== 'table') return;
    expect(table.align).toEqual(['left', 'center', 'right']);
    expect(table.header).toEqual([
      [{ type: 'text', text: 'A' }],
      [{ type: 'text', text: 'B' }],
      [{ type: 'text', text: 'C' }],
    ]);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[1][2]).toEqual([{ type: 'text', text: '6' }]);
  });

  it('CP-08-51: short and long rows fit the header; \\| stays inside the cell', () => {
    const [table] = parseMarkdown('| A | B |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |\n| x \\| y | z |');
    if (table.type !== 'table') throw new Error('not a table');
    expect(table.rows.map((r) => r.length)).toEqual([2, 2, 2]);
    expect(table.rows[0][1]).toEqual([]);
    expect(table.rows[2][0]).toEqual([{ type: 'text', text: 'x | y' }]);
  });

  it('CP-08-52: HTML in the content is plain text data, never markup', () => {
    const blocks = parseMarkdown(
      '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1)) <iframe src="a"></iframe>',
    );
    expect(blocks.every((b) => b.type === 'paragraph')).toBe(true);
    const texts = blocks.flatMap((b) => (b.type === 'paragraph' ? b.inline : []));
    expect(texts.every((i) => i.type === 'text')).toBe(true);
    expect(texts.map((i) => (i.type === 'text' ? i.text : '')).join('')).toContain('<script>');
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

  it('CP-08-67: a section without pages still shows in the tree', () => {
    const tree = buildWikiTree([], [{ name: 'Guías', title: 'Guías' }]);
    expect(tree.sections).toEqual([{ name: 'Guías', title: 'Guías', pages: [], sections: [] }]);
  });

  it('CP-08-68: validateSectionInput trims and rejects empty, unsafe or reserved names', () => {
    expect(validateSectionInput({ title: '  Guías   prácticas ' })).toEqual({
      ok: true,
      title: 'Guías prácticas',
    });
    for (const title of ['', '   ', '\t']) {
      expect(validateSectionInput({ title })).toEqual({
        ok: false,
        error: 'empty',
      });
    }
    for (const title of ['a/b', '..', '../x', 'a\\b', '.git', '_x', 'CON', 'x.', 'a:b']) {
      expect(validateSectionInput({ title }), title).toEqual({ ok: false, error: 'invalid' });
    }
    for (const input of [null, 'Guías', { title: 3 }, {}]) {
      expect(validateSectionInput(input)).toEqual({ ok: false, error: 'invalid' });
    }
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

describe('extractToc', () => {
  it('CP-08-33: lists ## and ### headings in order with level and unique id', () => {
    const toc = extractToc('# Título\n\n## Instalar\ntexto\n### Requisitos\n## Usar');
    expect(toc).toEqual([
      { id: 'instalar', level: 2, text: 'Instalar' },
      { id: 'requisitos', level: 3, text: 'Requisitos' },
      { id: 'usar', level: 2, text: 'Usar' },
    ]);
  });

  it('CP-08-34: skips #, #### or deeper and headings in code; repeated ones get distinct ids', () => {
    const content = [
      '# Uno',
      '#### Profundo',
      '```',
      '## En código',
      '```',
      '## Repetido',
      '## Repetido',
      '### Repetido',
    ].join('\n');
    const toc = extractToc(content);
    expect(toc.map((t) => t.text)).toEqual(['Repetido', 'Repetido', 'Repetido']);
    expect(new Set(toc.map((t) => t.id)).size).toBe(3);
  });

  it('gives an id to headings made only of symbols', () => {
    expect(extractToc('## ???')).toEqual([{ id: 'seccion', level: 2, text: '???' }]);
  });
});

describe('pageNavigation', () => {
  const page = (slug: string): NoteSummary => ({
    slug,
    title: slug,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  const tree: WikiTree = {
    pages: [page('R')],
    sections: [
      { name: 's1', title: 's1', pages: [page('A'), page('B')], sections: [] },
      { name: 's2', title: 's2', pages: [page('C')], sections: [] },
    ],
  };

  it('CP-08-35: neighbours follow the sidebar order and cross sections', () => {
    expect(pageNavigation(tree, 'B')).toEqual({ previous: page('A'), next: page('C') });
    expect(pageNavigation(tree, 'A').previous).toEqual(page('R'));
  });

  it('CP-08-36: no previous on the first page, no next on the last, none on a single page', () => {
    expect(pageNavigation(tree, 'R').previous).toBeNull();
    expect(pageNavigation(tree, 'C').next).toBeNull();
    const single: WikiTree = { pages: [page('X')], sections: [] };
    expect(pageNavigation(single, 'X')).toEqual({ previous: null, next: null });
    expect(pageNavigation(tree, 'nope')).toEqual({ previous: null, next: null });
  });
});

describe('attachment links in Markdown', () => {
  it('CP-08-123: parses an image and a file link inline', () => {
    const [block] = parseMarkdown(
      'Ver ![Captura](a.assets/c.png) y [manual](a.assets/m.pdf) y [[Otra]]',
    );
    expect(block).toMatchObject({
      type: 'paragraph',
      inline: [
        { type: 'text', text: 'Ver ' },
        { type: 'image', alt: 'Captura', src: 'a.assets/c.png' },
        { type: 'text', text: ' y ' },
        { type: 'file', label: 'manual', src: 'a.assets/m.pdf' },
        { type: 'text', text: ' y ' },
        { type: 'link', label: 'Otra', key: 'otra' },
      ],
    });
  });

  it('a section can never be named like an assets folder', () => {
    expect(isValidSection('nota.assets')).toBe(false);
    expect(isValidSection('Guías')).toBe(true);
  });
});

describe('nested folders (#89)', () => {
  const note = (slug: string, title: string, section?: string, order?: number): NoteSummary => ({
    slug,
    title,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...(section !== undefined && { section }),
    ...(order !== undefined && { order }),
  });

  it('CP-08-76: each folder uses its own title and order within its level', () => {
    const sections: SectionSummary[] = [
      { name: 'Proyectos', title: 'Proyectos' },
      { name: 'Proyectos/Zeta', title: 'Zeta', order: 1 },
      { name: 'Proyectos/Alfa', title: 'Alfa' },
      { name: 'Proyectos/Beta', title: 'Beta prácticas', order: 0 },
      { name: 'Otra', title: 'Otra', order: 0 },
      { name: 'Otra/Beta', title: 'Primera', order: 5 },
      { name: 'Otra/Alfa', title: 'Segunda', order: 9 },
    ];
    const tree = buildWikiTree([], sections);
    expect(tree.sections.map((s) => s.name)).toEqual(['Otra', 'Proyectos']);
    const [otra, proyectos] = tree.sections;
    expect(proyectos.sections.map((s) => s.title)).toEqual(['Beta prácticas', 'Zeta', 'Alfa']);
    expect(otra.sections.map((s) => s.title)).toEqual(['Primera', 'Segunda']);
  });

  it('CP-08-76: without _section.md a folder is titled with its own name', () => {
    const tree = buildWikiTree([note('A/B/n', 'N', 'A/B')], []);
    expect(tree.sections[0]).toMatchObject({ name: 'A', title: 'A' });
    expect(tree.sections[0].sections[0]).toMatchObject({ name: 'A/B', title: 'B' });
  });

  it('CP-08-77: a folder with no pages of its own but folders with pages, or an empty one, shows', () => {
    const tree = buildWikiTree(
      [note('P/Q/R/n', 'N', 'P/Q/R')],
      [{ name: 'Vacia/Hija', title: 'Hija' }],
    );
    const p = tree.sections.find((s) => s.name === 'P')!;
    expect(p.pages).toEqual([]);
    expect(p.sections[0].sections[0].pages.map((n) => n.slug)).toEqual(['P/Q/R/n']);
    expect(tree.sections.find((s) => s.name === 'Vacia')!.sections[0].name).toBe('Vacia/Hija');
  });

  it('CP-08-80: the trail has the title of every folder above the page', () => {
    const tree = buildWikiTree(
      [note('P/Q/adr', 'ADR-001', 'P/Q')],
      [
        { name: 'P', title: 'Proyectos' },
        { name: 'P/Q', title: 'OrquestadorPlus' },
      ],
    );
    expect(sectionTrail(tree, 'P/Q')).toEqual(['Proyectos', 'OrquestadorPlus']);
    expect(sectionTrail(tree, undefined)).toEqual([]);
    expect(sectionTrail(tree, 'X/Y')).toEqual(['X', 'Y']);
  });

  it('CP-08-84: previous / next walk folder by folder, depth first, in each level order', () => {
    const tree = buildWikiTree(
      [
        note('r', 'R'),
        note('A/a1', 'a1', 'A'),
        note('A/B/b1', 'b1', 'A/B'),
        note('A/C/c1', 'c1', 'A/C'),
        note('A/a2', 'a2', 'A', 9),
        note('Z/z1', 'z1', 'Z'),
      ],
      [
        { name: 'A/B', title: 'B', order: 2 },
        { name: 'A/C', title: 'C', order: 1 },
      ],
    );
    const walk: string[] = [];
    let at = pageNavigation(tree, 'r');
    walk.push('r');
    while (at.next) {
      walk.push(at.next.slug);
      at = pageNavigation(tree, at.next.slug);
    }
    // pages of a folder first (ordered first), then its folders by order
    expect(walk).toEqual(['r', 'A/a2', 'A/a1', 'A/C/c1', 'A/B/b1', 'Z/z1']);
  });

  it('CP-08-85: a title shared by two folders resolves to the shortest path, then the first by path', () => {
    const notes = [
      note('B/x/Dup', 'Dup', 'B/x'),
      note('A/Dup', 'Dup', 'A'),
      note('Z/Dup', 'Dup', 'Z'),
      note('C/Unico', 'Único', 'C'),
    ];
    const targets = linkTargets(notes);
    expect(targets.get('dup')).toBe('A/Dup');
    expect(targets.get(noteKey('Z/Dup'))).toBe('Z/Dup');
    expect(targets.get(noteKey('B/x/Dup'))).toBe('B/x/Dup');
    expect(targets.get(noteKey('A/Dup'))).toBe('A/Dup');
    expect(targets.get('único')).toBe('C/Unico');
    expect(targets.get('nada')).toBeUndefined();
    // a note in the root beats any folder
    expect(linkTargets([...notes, note('Dup', 'Dup')]).get('dup')).toBe('Dup');
  });

  it('CP-08-86: paths with .., absolute, backslashes or empty parts are not valid', () => {
    for (const bad of [
      '../x',
      'a/../b',
      '/etc/x',
      'a//b',
      'a/',
      'a\\b',
      'C:\\x',
      '',
      'a/.git/x',
      7,
    ]) {
      expect(isValidNotePath(bad), String(bad)).toBe(false);
    }
    for (const bad of ['..', '/a', 'a//b', 'a/..', 'a/b/', '_x/y', 'a/b.assets', null]) {
      expect(isValidSectionPath(bad), String(bad)).toBe(false);
    }
    expect(isValidNotePath('Proyectos/OrquestadorPlus/Decisiones/adr-001')).toBe(true);
    expect(isValidNotePath('suelta')).toBe(true);
    expect(isValidSectionPath('a/b c/ñ')).toBe(true);
  });

  it('CP-08-87: the depth limit allows 5 folders and rejects the 6th', () => {
    expect(MAX_SECTION_DEPTH).toBe(5);
    expect(isValidSectionPath('a/b/c/d/e')).toBe(true);
    expect(isValidSectionPath('a/b/c/d/e/f')).toBe(false);
    expect(isValidNotePath('a/b/c/d/e/nota')).toBe(true);
    expect(isValidNotePath('a/b/c/d/e/f/nota')).toBe(false);
    expect(validateSectionInput({ title: 'f', parent: 'a/b/c/d/e' })).toEqual({
      ok: false,
      error: 'too_deep',
    });
    expect(validateSectionInput({ title: 'e', parent: 'a/b/c/d' })).toEqual({
      ok: true,
      title: 'e',
      parent: 'a/b/c/d',
    });
  });

  it('CP-08-88: validateSectionInput and validateNoteInput reject bad parents and sections', () => {
    for (const parent of ['..', '../x', 'a//b', 7, null, '/etc']) {
      expect(validateSectionInput({ title: 'X', parent })).toEqual({ ok: false, error: 'invalid' });
    }
    for (const section of ['..', 'a/../b', '/x', 'a/b/c/d/e/f', 7, null]) {
      expect(validateNoteInput({ title: 'X', content: '', section })).toEqual({
        ok: false,
        error: 'invalid',
      });
    }
    expect(validateNoteInput({ title: 'X', content: '', section: 'a/b' }).ok).toBe(true);
  });
});
