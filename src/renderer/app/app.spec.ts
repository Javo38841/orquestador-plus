import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { Bug } from '../../shared/bugs';
import type { AppInfo, OrquestadorApi } from '../../shared/ipc';
import { App } from './app';
import { routes } from './app.routes';
import { AppInfoStore } from './core/app-info.store';
import { BugsStore } from './features/bugs/bugs.store';
import { DESKTOP_API } from './core/desktop-api';
import { TRANSLATIONS } from './i18n/transloco-loader';

function fakeApi(overrides: Partial<AppInfo> = {}, bugs: Bug[] = []): OrquestadorApi {
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
    convertInboxItem: async () => ({ ok: false, error: 'not_found' }),
    discardInboxItem: async () => false,
    listTasks: async () => [],
    createTask: async () => ({ ok: false, error: 'empty' }),
    updateTask: async () => ({ ok: false, error: 'empty' }),
    setTaskStatus: async () => ({ ok: false, error: 'not_found' }),
    setTaskForToday: async () => ({ ok: false, error: 'not_found' }),
    deleteTask: async () => false,
    listTags: async () => [],
    listProjects: async () => [],
    createProject: async () => ({ ok: false, error: 'empty' }),
    deleteProject: async () => false,
    listNotes: async () => [],
    listSections: async () => [],
    getNote: async () => ({ ok: false, error: 'not_found' }),
    createNote: async () => ({ ok: false, error: 'empty' }),
    updateNote: async () => ({ ok: false, error: 'not_found' }),
    deleteNote: async () => false,
    deleteSeries: async () => false,
    listBugs: async () => bugs,
    createBug: async () => ({ ok: false, error: 'empty' }),
    updateBug: async () => ({ ok: false, error: 'not_found' }),
    setBugStatus: async () => ({ ok: false, error: 'not_found' }),
    deleteBug: async () => false,
    listSnippets: async () => [],
    createSnippet: async () => ({ ok: false, error: 'empty_title' }),
    updateSnippet: async () => ({ ok: false, error: 'not_found' }),
    deleteSnippet: async () => false,
    copyToClipboard: async () => false,
    listTopics: async () => [],
    createTopic: async () => ({ ok: false, error: 'empty_title' }),
    updateTopic: async () => ({ ok: false, error: 'not_found' }),
    setTopicStatus: async () => ({ ok: false, error: 'not_found' }),
    deleteTopic: async () => false,
    listJournal: async () => [],
    saveJournalEntry: async () => ({ ok: true, entry: null }),
    search: async () => [],
    getPortalStatus: async () => ({ running: false, port: null, urls: [] }),
    setPortalEnabled: async () => ({ running: false, port: null, urls: [] }),
    listPortalLinks: async () => [],
    createPortalLink: async () => ({ ok: false, error: 'invalid_project' }),
    revokePortalLink: async () => false,
    getBoardProject: async () => null,
    setBoardProject: async (id: number | null) => id,
    getRemindersEnabled: async () => true,
    setRemindersEnabled: async (enabled: boolean) => enabled,
    exportAll: async () => ({ ok: false as const, error: 'cancelled' as const }),
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
  await TestBed.inject(BugsStore).load();
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
      'Ajustes',
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

  it('CP-10-09: Ctrl+K opens the search palette without touching quick capture', async () => {
    const el = await render(fakeApi());
    expect(el.querySelector('app-search-palette')).toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true }));
    TestBed.inject(ApplicationRef).tick();

    expect(el.querySelector('app-search-palette')).not.toBeNull();
    expect(el.querySelector('app-capture-panel')).toBeNull();
  });

  it('CP-09-10: the sidebar shows the number of open bugs', async () => {
    const bug = (id: number, status: Bug['status']): Bug => ({
      id,
      code: `BUG-${id}`,
      title: `b${id}`,
      symptom: '',
      impact: '',
      rootCause: '',
      solution: '',
      severity: 'medium',
      status,
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
    });
    const el = await render(fakeApi({}, [bug(1, 'new'), bug(2, 'analysis'), bug(3, 'resolved')]));
    expect(el.querySelector('[data-testid="bugs-count"]')?.textContent?.trim()).toBe('2');
  });
});
