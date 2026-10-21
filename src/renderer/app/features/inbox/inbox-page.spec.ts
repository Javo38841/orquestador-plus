import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { InboxItem } from '../../../../shared/inbox';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type { Task, TaskResult } from '../../../../shared/tasks';
import { DESKTOP_API } from '../../core/desktop-api';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { InboxPage } from './inbox-page';

const item: InboxItem = {
  id: 1,
  title: 'Revisar logs',
  source: 'quick_capture',
  createdAt: '2026-03-01T10:00:00.000Z',
};

async function render() {
  const convertInboxItem = vi.fn(async (): Promise<TaskResult> => ({ ok: true, task: {} as Task }));
  const discardInboxItem = vi.fn(async () => true);
  const api = {
    listInbox: async () => [item],
    listTasks: async () => [],
    listProjects: async () => [{ id: 3, name: 'cabina' }],
    convertInboxItem,
    discardInboxItem,
  } as unknown as OrquestadorApi;
  await TestBed.configureTestingModule({
    imports: [
      InboxPage,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
    providers: [{ provide: DESKTOP_API, useValue: api }],
  }).compileComponents();
  const fixture = TestBed.createComponent(InboxPage);
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`);
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  await settle();
  q('inbox-item')!.click();
  await settle();
  return { q, settle, convertInboxItem, discardInboxItem };
}

describe('InboxPage classify panel', () => {
  it('CP-01-09: converting without editing the title uses the captured title', async () => {
    const { q, settle, convertInboxItem } = await render();
    expect(q<HTMLInputElement>('classify-title')!.value).toBe('Revisar logs');
    q('classify-convert')!.click();
    await settle();
    expect(convertInboxItem).toHaveBeenCalledWith(1, {
      title: 'Revisar logs',
      dueDate: null,
      projectId: null,
      newProjectName: null,
    });
    expect(q('classify-panel')).toBeNull();
    expect(q('inbox-item')).toBeNull();
  });

  it('CP-01-10: discarding needs confirmation and then removes the item', async () => {
    const { q, settle, discardInboxItem } = await render();
    q('classify-discard')!.click();
    await settle();
    expect(discardInboxItem).not.toHaveBeenCalled();
    q('classify-discard-confirm')!.click();
    await settle();
    expect(discardInboxItem).toHaveBeenCalledWith(1);
    expect(q('inbox-item')).toBeNull();
  });

  it('CP-01-11: "Dejar para después" keeps the item and calls nothing', async () => {
    const { q, settle, convertInboxItem, discardInboxItem } = await render();
    q('classify-later')!.click();
    await settle();
    expect(q('classify-panel')).toBeNull();
    expect(q('inbox-item')).not.toBeNull();
    expect(convertInboxItem).not.toHaveBeenCalled();
    expect(discardInboxItem).not.toHaveBeenCalled();
  });

  it('CP-01-12: when conversion fails the item stays and an error shows', async () => {
    const { q, settle, convertInboxItem } = await render();
    convertInboxItem.mockRejectedValueOnce(new Error('boom'));
    q('classify-convert')!.click();
    await settle();
    expect(q('inbox-item')).not.toBeNull();
    expect(q('classify-error')!.textContent).toContain('No se pudo clasificar');
  });

  it('CP-01-13: Bug and Nota are disabled and say "Disponible pronto"', async () => {
    const { q } = await render();
    for (const id of ['type-bug', 'type-note']) {
      const button = q<HTMLButtonElement>(id)!;
      expect(button.disabled).toBe(true);
      expect(button.textContent).toContain('Disponible pronto');
    }
  });
});
