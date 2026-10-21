import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type {
  PortalLink,
  PortalLinkInput,
  PortalLinkResult,
  PortalStatus,
} from '../../../../shared/portal';
import { DESKTOP_API } from '../../core/desktop-api';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { PortalPage } from './portal-page';

const link = (id: number, extra: Partial<PortalLink> = {}): PortalLink => ({
  id,
  token: `token-${id}-`.padEnd(32, 'x'),
  projectId: null,
  projectName: null,
  createdAt: '2026-03-01T10:00:00.000Z',
  expiresAt: '2026-03-02T10:00:00.000Z',
  maxSubmissions: 20,
  submissions: 0,
  status: 'active',
  ...extra,
});

const OFF: PortalStatus = { running: false, port: null, urls: [] };
const ON: PortalStatus = { running: true, port: 47615, urls: ['http://192.168.1.20:47615'] };

async function render(links: PortalLink[] = [], status: PortalStatus = OFF) {
  let stored = links;
  const api = {
    getPortalStatus: vi.fn(async () => status),
    setPortalEnabled: vi.fn(async (enabled: boolean) => (enabled ? ON : OFF)),
    listPortalLinks: vi.fn(async () => stored),
    createPortalLink: vi.fn(async (input: PortalLinkInput): Promise<PortalLinkResult> => {
      const created = link(10, {
        projectId: input.projectId,
        maxSubmissions: input.maxSubmissions,
      });
      stored = [created, ...stored];
      return { ok: true, link: created };
    }),
    revokePortalLink: vi.fn(async (id: number) => {
      stored = stored.map((l) => (l.id === id ? { ...l, status: 'revoked' as const } : l));
      return true;
    }),
    copyToClipboard: vi.fn(async () => true),
    listProjects: vi.fn(async () => [{ id: 3, name: 'cabina' }]),
    listTasks: vi.fn(async () => []),
    listTags: vi.fn(async () => []),
  };
  await TestBed.configureTestingModule({
    imports: [
      PortalPage,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
    providers: [{ provide: DESKTOP_API, useValue: api as unknown as OrquestadorApi }],
  }).compileComponents();
  const fixture = TestBed.createComponent(PortalPage);
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  fixture.detectChanges();
  await settle();
  await settle();
  const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const click = async (id: string, index = 0) => {
    el.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)[index]!.click();
    await settle();
  };
  const select = async (id: string, value: string) => {
    const field = q(id) as HTMLSelectElement;
    field.value = value;
    field.dispatchEvent(new Event('change'));
    await settle();
  };
  const rows = () => [...el.querySelectorAll('[data-testid="portal-link"]')];
  return { api, q, click, select, rows, settle };
}

describe('PortalPage', () => {
  it('CP-15-06: creating a link by project and expiry lists it', async () => {
    const { api, click, select, rows } = await render([link(1)], ON);
    expect(rows()).toHaveLength(1);
    await select('link-project', '3');
    await select('link-expiry', '48');
    await click('link-create');
    expect(api.createPortalLink).toHaveBeenCalledWith({
      projectId: 3,
      expiresInHours: 48,
      maxSubmissions: 20,
    });
    expect(rows()).toHaveLength(2);
  });

  it('CP-15-06: copying a link writes its full address to the clipboard', async () => {
    const { api, click } = await render([link(1)], ON);
    await click('link-copy');
    expect(api.copyToClipboard).toHaveBeenCalledWith(
      `http://192.168.1.20:47615/r/${link(1).token}`,
    );
  });

  it('CP-15-06: revoking a link marks it as revoked and removes its actions', async () => {
    const { api, q, click, rows } = await render([link(1)], ON);
    await click('link-revoke');
    expect(api.revokePortalLink).toHaveBeenCalledWith(1);
    expect(rows()[0]!.textContent).toContain('Revocado');
    expect(q('link-revoke')).toBeNull();
    expect(q('link-copy')).toBeNull();
  });

  it('CP-15-07: while off it shows no address; turning it on shows the local network address', async () => {
    const { api, q, click } = await render([], OFF);
    expect(q('portal-state')?.textContent).toContain('Portal apagado');
    expect(q('portal-address')).toBeNull();

    await click('portal-toggle');
    expect(api.setPortalEnabled).toHaveBeenCalledWith(true);
    expect(q('portal-state')?.textContent).toContain('Portal encendido');
    expect(q('portal-address')?.textContent).toContain('http://192.168.1.20:47615');

    await click('portal-toggle');
    expect(api.setPortalEnabled).toHaveBeenLastCalledWith(false);
    expect(q('portal-address')).toBeNull();
  });

  it('CP-15-07: the outside-network switch is shown disabled (RF-16 is out of v1)', async () => {
    const { q } = await render();
    expect((q('portal-outside') as HTMLInputElement).disabled).toBe(true);
  });
});
