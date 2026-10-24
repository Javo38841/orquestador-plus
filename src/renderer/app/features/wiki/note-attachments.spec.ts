import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { AttachmentImageResult } from '../../../../shared/attachments';
import type { OrquestadorApi } from '../../../../shared/ipc';
import { DESKTOP_API } from '../../core/desktop-api';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { NoteBody } from './note-body';

async function render(
  content: string,
  read: (src: string) => AttachmentImageResult = () => ({
    ok: true,
    dataUrl: 'data:image/png;base64,AAAA',
  }),
) {
  const api = {
    readAttachment: vi.fn(async (_slug: string, src: string) => read(src)),
    openAttachment: vi.fn(async () => true),
  };
  await TestBed.configureTestingModule({
    imports: [
      NoteBody,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
    providers: [{ provide: DESKTOP_API, useValue: api as unknown as OrquestadorApi }],
  }).compileComponents();
  const fixture = TestBed.createComponent(NoteBody);
  fixture.componentRef.setInput('content', content);
  fixture.componentRef.setInput('slugs', new Map<string, string>());
  fixture.componentRef.setInput('slug', 'instalacion');
  fixture.detectChanges();
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { api, el, fixture };
}

const q = (el: HTMLElement, id: string) => el.querySelectorAll(`[data-testid="${id}"]`);

describe('NoteBody attachments', () => {
  it('CP-08-123: an image link shows the image; a link to another file shows as a link', async () => {
    const { api, el } = await render(
      '![Captura](instalacion.assets/captura.png)\n\n[manual.pdf](instalacion.assets/manual.pdf)',
    );

    const image = q(el, 'note-image')[0] as HTMLImageElement;
    expect(image.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(image.getAttribute('alt')).toBe('Captura');
    expect(api.readAttachment).toHaveBeenCalledTimes(1);
    expect(api.readAttachment).toHaveBeenCalledWith(
      'instalacion',
      'instalacion.assets/captura.png',
    );
    expect(q(el, 'note-file')[0].textContent).toContain('manual.pdf');
    expect(q(el, 'note-image')).toHaveLength(1);
  });

  it('CP-08-124: clicking a file link asks main to open it', async () => {
    const { api, el } = await render('[manual.pdf](instalacion.assets/manual.pdf)');

    (q(el, 'note-file')[0] as HTMLElement).click();

    expect(api.openAttachment).toHaveBeenCalledWith('instalacion', 'instalacion.assets/manual.pdf');
  });

  it('CP-08-125: a missing image shows "imagen no encontrada" and the rest renders', async () => {
    const { el } = await render(
      'Antes\n\n![Falta](instalacion.assets/nada.png)\n\nDespués con **negrita**',
      () => ({ ok: false, error: 'not_found' }),
    );

    expect(q(el, 'note-image')).toHaveLength(0);
    expect(q(el, 'note-image-missing')[0].textContent).toContain('imagen no encontrada');
    expect(el.textContent).toContain('Antes');
    expect(el.textContent).toContain('Después con');
    expect(el.querySelector('strong')?.textContent).toBe('negrita');
  });

  it('CP-08-126: external, absolute and escaping targets are not loaded, not opened, no request', async () => {
    const bad = [
      'https://example.com/a.png',
      'http://example.com/a.png',
      '//example.com/a.png',
      '/etc/passwd',
      '../../x.png',
      'file:///etc/passwd',
    ];
    const { api, el } = await render(
      bad.map((src) => `![img](${src})\n\n[doc](${src})`).join('\n\n'),
    );

    expect(api.readAttachment).not.toHaveBeenCalled();
    expect(el.querySelectorAll('img')).toHaveLength(0);
    expect(el.querySelectorAll('a')).toHaveLength(0);
    expect(q(el, 'note-image-blocked')).toHaveLength(bad.length);
    expect(q(el, 'note-link-blocked')).toHaveLength(bad.length);
    expect(q(el, 'note-file')).toHaveLength(0);
    (q(el, 'note-link-blocked')[0] as HTMLElement).click();
    expect(api.openAttachment).not.toHaveBeenCalled();
  });

  it('does not ask main for images of a note that is not saved yet', async () => {
    const { api, fixture, el } = await render('![a](x.assets/a.png)');
    api.readAttachment.mockClear();
    fixture.componentRef.setInput('slug', '');
    fixture.componentRef.setInput('content', '![b](x.assets/b.png)');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.readAttachment).not.toHaveBeenCalled();
    expect(q(el, 'note-image-missing')).toHaveLength(1);
  });
});
