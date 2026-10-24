import { describe, expect, it } from 'vitest';
import {
  attachmentLink,
  isImageName,
  isRunnableName,
  localTarget,
  rewriteAssetLinks,
  sanitizeAttachmentName,
  uniqueAttachmentName,
} from './attachments';

describe('attachments (shared)', () => {
  it('CP-08-116: an image gets an image link, relative to the note', () => {
    expect(attachmentLink('instalacion', 'captura.png')).toBe(
      '![captura](instalacion.assets/captura.png)',
    );
  });

  it('CP-08-117: any other file gets a plain link with its full name', () => {
    expect(attachmentLink('instalacion', 'manual.pdf')).toBe(
      '[manual.pdf](instalacion.assets/manual.pdf)',
    );
    expect(isImageName('FOTO.JPG')).toBe(true);
    expect(isImageName('notas.txt')).toBe(false);
  });

  it('CP-08-118: a taken name (any case) gets the next free -n suffix', () => {
    expect(uniqueAttachmentName('a.png', new Set())).toBe('a.png');
    expect(uniqueAttachmentName('a.png', new Set(['a.png']))).toBe('a-1.png');
    expect(uniqueAttachmentName('a.png', new Set(['A.PNG', 'a-1.png']))).toBe('a-2.png');
    expect(uniqueAttachmentName('README', new Set(['README']))).toBe('README-1');
  });

  it('CP-08-119: names are reduced to one safe entry', () => {
    const cases: [string, string][] = [
      ['../../evil.png', 'evil.png'],
      ['..\\..\\evil.png', 'evil.png'],
      ['..', 'adjunto'],
      ['', 'adjunto'],
      ['a b (1).png', 'a-b-1.png'],
      ['x:y*z?.txt', 'x-y-z.txt'],
      ['.hidden', 'hidden'],
      ['CON.txt', '_CON.txt'],
      ['mi captura.PNG', 'mi-captura.PNG'],
    ];
    for (const [input, expected] of cases) expect(sanitizeAttachmentName(input)).toBe(expected);
    expect(sanitizeAttachmentName(42)).toBe('adjunto');
    expect(Array.from(sanitizeAttachmentName('x'.repeat(500) + '.png')).length).toBeLessThanOrEqual(
      100,
    );
    expect(sanitizeAttachmentName('x'.repeat(500) + '.png').endsWith('.png')).toBe(true);
  });

  it('CP-08-126: only plain relative paths are local targets', () => {
    expect(localTarget('a.assets/c.png')).toBe('a.assets/c.png');
    expect(localTarget('Mi%20nota.assets/c.png')).toBe('Mi nota.assets/c.png');
    for (const bad of [
      'https://x.com/a.png',
      'HTTP://x.com/a.png',
      '//x.com/a.png',
      '/etc/passwd',
      '\\\\server\\share',
      'C:\\a.png',
      '../x.png',
      'a/../../x.png',
      '%2e%2e/x.png',
      'a//b.png',
      'javascript:alert(1)',
      'data:image/png;base64,AA',
      '%zz',
      '',
    ]) {
      expect(localTarget(bad)).toBeNull();
    }
  });

  it('CP-08-124: programs and scripts are recognized so they are never opened', () => {
    expect(isRunnableName('setup.EXE')).toBe(true);
    expect(isRunnableName('run.sh')).toBe(true);
    expect(isRunnableName('manual.pdf')).toBe(false);
  });

  it('CP-08-127: links to the old assets folder follow the rename; others are untouched', () => {
    const body =
      '![a](Viejo.assets/a.png) [b](Viejo.assets/b.pdf) ![c](Otra.assets/c.png) [x](https://e.com)';
    expect(rewriteAssetLinks(body, 'Viejo', 'Nuevo nombre')).toBe(
      '![a](Nuevo%20nombre.assets/a.png) [b](Nuevo%20nombre.assets/b.pdf) ![c](Otra.assets/c.png) [x](https://e.com)',
    );
  });
});
