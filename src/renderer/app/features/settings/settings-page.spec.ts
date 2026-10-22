import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { ExportResult } from '../../../../shared/export';
import type { OrquestadorApi } from '../../../../shared/ipc';
import es from '../../../../../locales/es.json';
import { DESKTOP_API } from '../../core/desktop-api';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { SettingsPage } from './settings-page';

async function render(result: ExportResult) {
  const exportAll = vi.fn(async () => result);
  const setRemindersEnabled = vi.fn(async (value: boolean) => value);
  await TestBed.configureTestingModule({
    imports: [
      SettingsPage,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
    providers: [
      {
        provide: DESKTOP_API,
        useValue: {
          exportAll,
          getRemindersEnabled: async () => true,
          setRemindersEnabled,
        } as unknown as OrquestadorApi,
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(SettingsPage);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  return { fixture, el, q, exportAll, setRemindersEnabled };
}

describe('SettingsPage', () => {
  it('CP-05-22: the reminders switch lives in Ajustes and still saves the choice', async () => {
    const { fixture, q, setRemindersEnabled } = await render({ ok: false, error: 'cancelled' });
    await fixture.whenStable();
    fixture.detectChanges();
    const toggle = q('reminders-enabled') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(setRemindersEnabled).toHaveBeenCalledWith(false);
  });

  it('CP-11-11: shows what is exported, the button and the offline indicator from es.json', async () => {
    const { el, q } = await render({ ok: false, error: 'cancelled' });
    const text = el.textContent!;
    for (const label of [
      es.nav.settings,
      es.export.title,
      es.export.included.tasks,
      es.export.included.inbox,
      es.export.included.wiki,
      es.export.button,
      es.app.offline,
    ]) {
      expect(text).toContain(label);
    }
    expect(q('export-all')!.tagName).toBe('BUTTON');
    expect(q('export-offline')).not.toBeNull();
  });

  it('confirms the saved location after exporting', async () => {
    const { fixture, q, exportAll } = await render({ ok: true, path: '/home/u/a.zip' });
    q('export-all')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(exportAll).toHaveBeenCalledWith();
    expect(q('export-done')!.textContent).toContain(es.export.done);
    expect(q('export-path')!.textContent).toBe('/home/u/a.zip');
  });

  it('CP-11-08: shows the cancel and failure messages', async () => {
    const cancelled = await render({ ok: false, error: 'cancelled' });
    cancelled.q('export-all')!.click();
    await cancelled.fixture.whenStable();
    cancelled.fixture.detectChanges();
    expect(cancelled.q('export-failed')!.textContent).toContain(es.export.cancelled);

    TestBed.resetTestingModule();
    const failed = await render({ ok: false, error: 'write_failed' });
    failed.q('export-all')!.click();
    await failed.fixture.whenStable();
    failed.fixture.detectChanges();
    expect(failed.q('export-failed')!.textContent).toContain(es.export.failed);
  });
});
