import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { OrquestadorApi } from '../../../../shared/ipc';
import { SNIPPET_CONTENT_MAX_LENGTH, type SnippetInput } from '../../../../shared/snippets';
import { DESKTOP_API } from '../../core/desktop-api';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { NoteBody } from './note-body';

async function render(content: string, createResult: 'ok' | 'fail' = 'ok') {
  const createSnippet = vi.fn(async (input: SnippetInput) =>
    createResult === 'ok'
      ? {
          ok: true as const,
          snippet: {
            id: 1,
            ...input,
            tags: [],
            createdAt: '2026-03-01T10:00:00.000Z',
            updatedAt: '2026-03-01T10:00:00.000Z',
          },
        }
      : { ok: false as const, error: 'invalid' as const },
  );
  await TestBed.configureTestingModule({
    imports: [
      NoteBody,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
    providers: [{ provide: DESKTOP_API, useValue: { createSnippet } as unknown as OrquestadorApi }],
  }).compileComponents();
  const fixture = TestBed.createComponent(NoteBody);
  fixture.componentRef.setInput('content', content);
  fixture.componentRef.setInput('slugs', new Map<string, string>());
  fixture.componentRef.setInput('pageTitle', 'Mi página');
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { el, createSnippet, settle };
}

const q = (el: HTMLElement, id: string) => el.querySelectorAll(`[data-testid="${id}"]`);

describe('NoteBody', () => {
  it('CP-08-53: each callout shows its icon and its label from the translations', async () => {
    const { el } = await render(
      ':::note\na\n:::\n\n:::tip\nb\n:::\n\n:::caution\nc\n:::\n\n:::note[Mío]\nd\n:::',
    );
    expect([...q(el, 'callout-label')].map((n) => n.textContent?.trim())).toEqual([
      'Nota',
      'Consejo',
      'Precaución',
      'Mío',
    ]);
    expect(q(el, 'callout-icon')).toHaveLength(4);
    const classes = [...q(el, 'callout')].map((n) => n.className).join(' ');
    expect(classes).toContain('callout-note');
    expect(classes).toContain('callout-tip');
    expect(classes).toContain('callout-caution');
    expect(classes).not.toMatch(/#[0-9a-f]{3,6}|\[#/i);
  });

  it('CP-08-53: code titles and tables are drawn as elements', async () => {
    const { el } = await render(
      '```sql title="consulta.sql"\nSELECT 1\n```\n\n| A | B |\n|:--|--:|\n| 1 | 2 |',
    );
    expect(q(el, 'code-title')[0].textContent?.trim()).toBe('consulta.sql');
    expect(el.querySelectorAll('table thead th')).toHaveLength(2);
    expect(el.querySelectorAll('table tbody td')).toHaveLength(2);
    expect((el.querySelectorAll('th')[1] as HTMLElement).style.textAlign).toBe('right');
  });

  it('CP-08-49: titles and code with markup are shown as literal text', async () => {
    const { el } = await render('```html title="<b>x</b>"\n<img src=x onerror=alert(1)>\n```');
    expect(q(el, 'code-title')[0].textContent?.trim()).toBe('<b>x</b>');
    expect(el.querySelector('code')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('figcaption b')).toBeNull();
  });

  it('CP-08-52: HTML in the page creates no active element, attribute or URL', async () => {
    const { el } = await render(
      '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<iframe src="a"></iframe>\n\n[x](javascript:alert(1))',
    );
    expect(el.querySelector('script, img, iframe, a, [onerror]')).toBeNull();
    expect(el.textContent).toContain('<script>alert(1)</script>');
    expect(el.textContent).toContain('javascript:alert(1)');
  });

  it('CP-08-54: "Guardar en Snippets" creates a snippet typed by language and confirms', async () => {
    const { el, createSnippet, settle } = await render(
      '```sql title="consulta.sql"\nSELECT *\n  FROM t;\n```\n\n```bash\nls -la\n```',
    );
    (q(el, 'code-save-snippet')[0] as HTMLElement).click();
    await settle();
    expect(createSnippet).toHaveBeenCalledWith({
      title: 'consulta.sql',
      type: 'sql',
      content: 'SELECT *\n  FROM t;',
    });
    expect(q(el, 'code-save-feedback')[0].textContent?.trim()).toBe('Guardado');

    (q(el, 'code-save-snippet')[1] as HTMLElement).click();
    await settle();
    expect(createSnippet).toHaveBeenLastCalledWith({
      title: 'Mi página',
      type: 'command',
      content: 'ls -la',
    });
  });

  it('CP-08-54: a block inside a callout can also be saved', async () => {
    const { el, createSnippet, settle } = await render(':::tip\n```sh\necho hi\n```\n:::');
    (q(el, 'code-save-snippet')[0] as HTMLElement).click();
    await settle();
    expect(createSnippet).toHaveBeenCalledOnce();
  });

  it('CP-08-55: empty code has no button; too long code shows the error and saves nothing', async () => {
    const long = 'x'.repeat(SNIPPET_CONTENT_MAX_LENGTH + 1);
    const { el, createSnippet, settle } = await render('```\n```\n\n```sql\n' + long + '\n```');
    expect(q(el, 'code-save-snippet')).toHaveLength(1);
    (q(el, 'code-save-snippet')[0] as HTMLElement).click();
    await settle();
    expect(createSnippet).not.toHaveBeenCalled();
    expect(q(el, 'code-save-feedback')[0].textContent).toContain('demasiado largo');
  });

  it('CP-08-55: a failed save shows the translated error', async () => {
    const { el, settle } = await render('```sh\nls\n```', 'fail');
    (q(el, 'code-save-snippet')[0] as HTMLElement).click();
    await settle();
    expect(q(el, 'code-save-feedback')[0].textContent).toContain('No se pudo guardar');
  });
});
