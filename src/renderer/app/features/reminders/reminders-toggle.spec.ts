import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { OrquestadorApi } from '../../../../shared/ipc';
import { DESKTOP_API } from '../../core/desktop-api';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { RemindersToggle } from './reminders-toggle';

async function render(initial: boolean) {
  const setRemindersEnabled = vi.fn(async (value: boolean) => value);
  const api = {
    getRemindersEnabled: async () => initial,
    setRemindersEnabled,
  } as unknown as OrquestadorApi;
  await TestBed.configureTestingModule({
    imports: [
      RemindersToggle,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
    providers: [{ provide: DESKTOP_API, useValue: api }],
  }).compileComponents();
  const fixture = TestBed.createComponent(RemindersToggle);
  await fixture.whenStable();
  fixture.detectChanges();
  const box = fixture.nativeElement.querySelector(
    '[data-testid="reminders-enabled"]',
  ) as HTMLInputElement;
  return { fixture, box, setRemindersEnabled };
}

describe('RemindersToggle', () => {
  it('reflects the stored setting', async () => {
    expect((await render(false)).box.checked).toBe(false);
    TestBed.resetTestingModule();
    expect((await render(true)).box.checked).toBe(true);
  });

  it('CP-18-08: turning it off is sent to main', async () => {
    const { box, setRemindersEnabled, fixture } = await render(true);
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(setRemindersEnabled).toHaveBeenCalledWith(false);
  });
});
