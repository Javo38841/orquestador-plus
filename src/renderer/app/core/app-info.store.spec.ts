import { TestBed } from '@angular/core/testing';
import type { AppInfo } from '../../../shared/ipc';
import { AppInfoStore } from './app-info.store';
import { DESKTOP_API } from './desktop-api';

const info: AppInfo = {
  name: 'OrquestadorPlus Dev',
  version: '0.1.0',
  channel: 'dev',
  platform: 'linux',
  databaseReady: true,
};

describe('AppInfoStore', () => {
  it('loads the app info from the desktop API', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: DESKTOP_API, useValue: { getAppInfo: async () => info } }],
    });
    const store = TestBed.inject(AppInfoStore);

    await store.load();

    expect(store.appInfo()).toEqual(info);
    expect(store.isDev()).toBe(true);
    expect(store.databaseReady()).toBe(true);
  });

  it('stays empty outside Electron', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: DESKTOP_API, useValue: null }] });
    const store = TestBed.inject(AppInfoStore);

    await store.load();

    expect(store.appInfo()).toBeNull();
    expect(store.isDev()).toBe(false);
    expect(store.databaseReady()).toBe(false);
  });
});
