import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { CaptureResult } from '../../../../shared/inbox';
import type { OrquestadorApi } from '../../../../shared/ipc';
import { DESKTOP_API } from '../../core/desktop-api';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { InboxStore } from '../inbox/inbox.store';
import { CapturePanel } from './capture-panel';

async function render() {
  const captureInbox = vi.fn(async (text: string): Promise<CaptureResult> => ({
    ok: true,
    item: { id: 1, title: text, source: 'quick_capture', createdAt: new Date().toISOString() },
  }));
  await TestBed.configureTestingModule({
    imports: [
      CapturePanel,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
    providers: [
      {
        provide: DESKTOP_API,
        useValue: { captureInbox, listInbox: async () => [] } as unknown as OrquestadorApi,
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(CapturePanel);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector<HTMLInputElement>('[data-testid="capture-input"]')!;
  const type = (value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const enter = async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, el, input, type, enter, captureInbox };
}

describe('CapturePanel', () => {
  afterEach(() => document.body.replaceChildren());

  it('CP-01-06: saving clears the field and keeps the focus', async () => {
    const { fixture, input, type, enter, captureInbox } = await render();
    type('Comprar cable USB-C');
    await enter();

    expect(captureInbox).toHaveBeenCalledWith('Comprar cable USB-C');
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(TestBed.inject(InboxStore).count()).toBe(1);
    fixture.destroy();
  });

  it('CP-01-06: Esc closes the capture without saving', async () => {
    const { fixture, input, type, captureInbox } = await render();
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    type('no guardar');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(closed).toBe(1);
    expect(captureInbox).not.toHaveBeenCalled();
  });

  it('CP-01-04: empty text shows "Escribe algo para capturar"', async () => {
    const { el, type, enter, captureInbox } = await render();
    type('   ');
    await enter();

    expect(el.querySelector('[data-testid="capture-error"]')?.textContent).toContain(
      'Escribe algo para capturar',
    );
    expect(captureInbox).not.toHaveBeenCalled();
  });

  it('CP-01-05: over 500 characters shows "Máximo 500 caracteres"', async () => {
    const { el, type, enter, captureInbox } = await render();
    type('a'.repeat(501));
    await enter();

    expect(el.querySelector('[data-testid="capture-error"]')?.textContent).toContain(
      'Máximo 500 caracteres',
    );
    expect(captureInbox).not.toHaveBeenCalled();
  });
});
