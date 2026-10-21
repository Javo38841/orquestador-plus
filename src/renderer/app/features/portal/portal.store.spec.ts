import { TestBed } from '@angular/core/testing';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type { PortalLink } from '../../../../shared/portal';
import { DESKTOP_API } from '../../core/desktop-api';
import { PortalStore } from './portal.store';

const link = (extra: Partial<PortalLink> = {}): PortalLink => ({
  id: 1,
  token: 'abc',
  projectId: null,
  projectName: null,
  createdAt: '',
  expiresAt: '',
  maxSubmissions: 5,
  submissions: 0,
  status: 'active',
  ...extra,
});

function setup(api: Partial<OrquestadorApi> | null) {
  TestBed.configureTestingModule({
    providers: [{ provide: DESKTOP_API, useValue: api as OrquestadorApi | null }],
  });
  return TestBed.inject(PortalStore);
}

describe('PortalStore', () => {
  it('builds a link address from the first local network URL', async () => {
    const store = setup({
      getPortalStatus: async () => ({ running: true, port: 1, urls: ['http://10.0.0.2:1'] }),
      listPortalLinks: async () => [link()],
    });
    await store.load();
    expect(store.addressOf(link())).toBe('http://10.0.0.2:1/r/abc');
  });

  it('has no address while the portal is off or without a network', async () => {
    const store = setup({
      getPortalStatus: async () => ({ running: true, port: 1, urls: [] }),
      listPortalLinks: async () => [],
    });
    await store.load();
    expect(store.addressOf(link())).toBeNull();
  });

  it('returns the error of a link the main process refuses', async () => {
    const store = setup({
      createPortalLink: async () => ({ ok: false, error: 'invalid_project' }),
    });
    expect(await store.create({ projectId: 9, expiresInHours: 1, maxSubmissions: 1 })).toBe(
      'invalid_project',
    );
    expect(store.links()).toEqual([]);
  });

  it('validates locally before calling the API', async () => {
    const createPortalLink = vi.fn();
    const store = setup({ createPortalLink });
    expect(await store.create({ projectId: null, expiresInHours: 0, maxSubmissions: 1 })).toBe(
      'invalid_expiry',
    );
    expect(createPortalLink).not.toHaveBeenCalled();
  });

  it('does nothing without the desktop API', async () => {
    const store = setup(null);
    await store.load();
    expect(store.links()).toEqual([]);
    expect(store.status().running).toBe(false);
  });
});
