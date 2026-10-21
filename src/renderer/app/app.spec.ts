import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { AppInfo, OrquestadorApi } from '../../shared/ipc';
import { App } from './app';
import { routes } from './app.routes';
import { AppInfoStore } from './core/app-info.store';
import { DESKTOP_API } from './core/desktop-api';
import { TRANSLATIONS } from './i18n/transloco-loader';

function fakeApi(overrides: Partial<AppInfo> = {}): OrquestadorApi {
  return {
    getAppInfo: async () => ({
      name: 'OrquestadorPlus',
      version: '0.1.0',
      channel: 'prod',
      platform: 'linux',
      databaseReady: true,
      ...overrides,
    }),
    listInbox: async () => [],
    captureInbox: async () => ({ ok: false, error: 'empty' }),
    listTasks: async () => [],
    createTask: async () => ({ ok: false, error: 'empty' }),
    updateTask: async () => ({ ok: false, error: 'empty' }),
    setTaskStatus: async () => ({ ok: false, error: 'not_found' }),
    setTaskForToday: async () => ({ ok: false, error: 'not_found' }),
    deleteTask: async () => false,
    listProjects: async () => [],
    createProject: async () => ({ ok: false, error: 'empty' }),
    deleteProject: async () => false,
  };
}

async function render(api: OrquestadorApi) {
  await TestBed.configureTestingModule({
    imports: [
      App,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
    providers: [provideRouter(routes), { provide: DESKTOP_API, useValue: api }],
  }).compileComponents();
  await TestBed.inject(AppInfoStore).load();
  const fixture = TestBed.createComponent(App);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('App', () => {
  it('renders the sidebar sections in Spanish', async () => {
    const el = await render(fakeApi());
    const links = [...el.querySelectorAll('nav a')].map((a) => a.textContent?.trim());
    expect(links).toEqual([
      'Hoy',
      'Bandeja de entrada',
      'Tareas',
      'Tablero',
      'Bugs e incidencias',
      'Wiki',
      'Bitácora',
      'Snippets',
      'Aprendizaje',
      'Portal de reportes',
    ]);
  });

  it('shows the DEV banner only on the dev channel', async () => {
    const dev = await render(fakeApi({ channel: 'dev' }));
    expect(dev.querySelector('[data-testid="dev-banner"]')).not.toBeNull();

    TestBed.resetTestingModule();
    const prod = await render(fakeApi({ channel: 'prod' }));
    expect(prod.querySelector('[data-testid="dev-banner"]')).toBeNull();
  });

  it('reports the database status', async () => {
    const el = await render(fakeApi({ databaseReady: false }));
    expect(el.querySelector('[data-testid="database-status"]')?.textContent).toContain(
      'Base de datos no disponible',
    );
  });

  it('CP-01-01: Ctrl+Space opens the quick capture panel', async () => {
    const el = await render(fakeApi());
    expect(el.querySelector('app-capture-panel')).toBeNull();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', code: 'Space', ctrlKey: true }),
    );
    TestBed.inject(ApplicationRef).tick();

    expect(el.querySelector('app-capture-panel')).not.toBeNull();
  });
});
