import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { InboxItem } from '../../../../shared/inbox';
import type { OrquestadorApi } from '../../../../shared/ipc';
import type { Task } from '../../../../shared/tasks';
import { DESKTOP_API } from '../../core/desktop-api';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { InboxPage } from './inbox-page';

const item: InboxItem = {
  id: 1,
  title: 'Revisar logs',
  source: 'quick_capture',
  createdAt: '2026-03-01T10:00:00.000Z',
};

async function render(items: InboxItem[] = [item]) {
  const convertInboxItem = vi.fn<OrquestadorApi['convertInboxItem']>(async () => ({
    ok: true,
    type: 'task',
    task: {} as Task,
  }));
  const navigate = vi.fn(async () => true);
  const discardInboxItem = vi.fn(async () => true);
  const api = {
    listInbox: async () => items,
    listTasks: async () => [],
    listTags: async () => ['infra'],
    listProjects: async () => [{ id: 3, name: 'cabina' }],
    listNotes: async () => [],
    listSections: async () => [
      { name: 'Guias', title: 'Guias' },
      { name: 'Guias/Avanzado', title: 'Avanzado' },
    ],
    listSkippedFiles: async () => [],
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
    providers: [
      { provide: DESKTOP_API, useValue: api },
      { provide: Router, useValue: { navigate } },
    ],
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
  return { q, settle, convertInboxItem, discardInboxItem, navigate };
}

describe('InboxPage classify panel', () => {
  it('CP-15-08: a portal item shows the "Portal" label and the reporter, and can be classified', async () => {
    const portalItem: InboxItem = {
      id: 2,
      title: 'Pantalla blanca',
      source: 'portal',
      reporter: 'Ana',
      createdAt: '2026-03-01T10:00:00.000Z',
    };
    const { q, settle, convertInboxItem } = await render([portalItem]);
    const row = q('inbox-item')!;
    expect(row.textContent).toContain('Portal');
    expect(q('inbox-reporter')!.textContent).toContain('Ana');
    expect(q<HTMLInputElement>('classify-title')!.value).toBe('Pantalla blanca');

    q('classify-convert')!.click();
    await settle();
    expect(convertInboxItem).toHaveBeenCalledWith(2, {
      type: 'task',
      input: expect.objectContaining({ title: 'Pantalla blanca' }),
    });
  });

  it('CP-15-08: a quick capture shows no reporter', async () => {
    const { q } = await render();
    expect(q('inbox-reporter')).toBeNull();
    expect(q('inbox-item')!.textContent).toContain('Captura rápida');
  });

  it('CP-01-09: converting without editing the title uses the captured title', async () => {
    const { q, settle, convertInboxItem } = await render();
    expect(q<HTMLInputElement>('classify-title')!.value).toBe('Revisar logs');
    q('classify-convert')!.click();
    await settle();
    expect(convertInboxItem).toHaveBeenCalledWith(1, {
      type: 'task',
      input: {
        title: 'Revisar logs',
        dueDate: null,
        projectId: null,
        newProjectName: null,
        tags: [],
      },
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

  it('CP-01-28: Bug and Nota are enabled and no longer say "Disponible pronto"', async () => {
    const { q } = await render();
    for (const id of ['type-task', 'type-bug', 'type-note']) {
      const button = q<HTMLButtonElement>(id)!;
      expect(button.disabled).toBe(false);
      expect(button.textContent).not.toContain('Disponible pronto');
    }
  });

  describe('bug and note', () => {
    const fill = async (
      q: (id: string) => HTMLElement | null,
      settle: () => Promise<void>,
      id: string,
      value: string,
    ) => {
      const field = q(id) as HTMLInputElement;
      field.value = value;
      field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input'));
      await settle();
    };

    it('CP-01-14: choosing Bug shows title, symptom, impact, severity and optional fields', async () => {
      const { q, settle } = await render();
      q('type-bug')!.click();
      await settle();
      expect(q<HTMLInputElement>('classify-title')!.value).toBe('Revisar logs');
      for (const id of [
        'classify-symptom',
        'classify-impact',
        'classify-severity',
        'classify-root-cause',
        'classify-solution',
      ]) {
        expect(q(id)).not.toBeNull();
      }
      expect(q('classify-due')).toBeNull();
      expect(q('classify-panel')!.textContent).toContain('Causa raíz · opcional');
    });

    it('CP-01-15: converting a complete bug form sends it and removes the item', async () => {
      const { q, settle, convertInboxItem } = await render();
      convertInboxItem.mockResolvedValueOnce({
        ok: true,
        type: 'bug',
        bug: { title: 'Revisar logs' } as never,
      });
      q('type-bug')!.click();
      await settle();
      await fill(q, settle, 'classify-symptom', 'Pantalla blanca');
      await fill(q, settle, 'classify-impact', 'Nadie entra');
      await fill(q, settle, 'classify-severity', 'low');
      q('classify-convert')!.click();
      await settle();
      expect(convertInboxItem).toHaveBeenCalledWith(1, {
        type: 'bug',
        input: {
          title: 'Revisar logs',
          symptom: 'Pantalla blanca',
          impact: 'Nadie entra',
          rootCause: '',
          solution: '',
          severity: 'low',
        },
      });
      expect(q('inbox-item')).toBeNull();
    });

    it('CP-01-16: an incomplete bug shows a Spanish error and keeps the item', async () => {
      const { q, settle, convertInboxItem } = await render();
      q('type-bug')!.click();
      await settle();
      q('classify-convert')!.click();
      await settle();
      expect(q('classify-error')!.textContent).toContain('síntoma y el impacto son obligatorios');
      await fill(q, settle, 'classify-title', '  ');
      q('classify-convert')!.click();
      await settle();
      expect(q('classify-error')!.textContent).toContain('Escribe un título para el bug');
      expect(convertInboxItem).not.toHaveBeenCalled();
      expect(q('inbox-item')).not.toBeNull();
    });

    it('CP-01-17: the reporter of a portal item is kept in the pre-filled symptom', async () => {
      const { q, settle, convertInboxItem } = await render([
        { ...item, id: 2, source: 'portal', reporter: 'Ana' },
      ]);
      q('type-bug')!.click();
      await settle();
      expect(q<HTMLTextAreaElement>('classify-symptom')!.value).toContain('Ana');
      await fill(q, settle, 'classify-impact', 'Bloquea');
      q('classify-convert')!.click();
      await settle();
      expect(convertInboxItem).toHaveBeenCalledWith(
        2,
        expect.objectContaining({
          input: expect.objectContaining({ symptom: 'Reportado por: Ana' }),
        }),
      );
    });

    it('CP-01-18: choosing Nota asks for the title and a section, root and nested', async () => {
      const { q, settle } = await render();
      q('type-note')!.click();
      await settle();
      expect(q<HTMLInputElement>('classify-title')!.value).toBe('Revisar logs');
      const options = [...q('classify-section')!.querySelectorAll('option')].map((o) => ({
        value: o.value,
        text: o.textContent!.trim(),
      }));
      expect(options).toEqual([
        { value: '', text: 'Raíz de la wiki' },
        { value: 'Guias', text: 'Guias' },
        { value: 'Guias/Avanzado', text: 'Guias/Avanzado' },
      ]);
    });

    it('CP-01-19: converting a note sends title and section and removes the item', async () => {
      const { q, settle, convertInboxItem } = await render();
      convertInboxItem.mockResolvedValueOnce({
        ok: true,
        type: 'note',
        note: { title: 'Mi nota', slug: 'Guias/Mi nota' } as never,
      });
      q('type-note')!.click();
      await settle();
      await fill(q, settle, 'classify-title', 'Mi nota');
      await fill(q, settle, 'classify-section', 'Guias/Avanzado');
      q('classify-convert')!.click();
      await settle();
      expect(convertInboxItem).toHaveBeenCalledWith(1, {
        type: 'note',
        input: { title: 'Mi nota', section: 'Guias/Avanzado', content: '' },
      });
      expect(q('inbox-item')).toBeNull();
    });

    it('CP-01-20: a duplicate note shows a Spanish error and keeps the item', async () => {
      const { q, settle, convertInboxItem } = await render();
      convertInboxItem.mockResolvedValueOnce({ ok: false, error: 'duplicate' });
      q('type-note')!.click();
      await settle();
      q('classify-convert')!.click();
      await settle();
      expect(q('classify-error')!.textContent).toContain('Ya existe una nota con ese título');
      expect(q('inbox-item')).not.toBeNull();
      expect(q('classify-panel')).not.toBeNull();
    });

    it('CP-01-21: an empty or too long note title shows an error and sends nothing', async () => {
      const { q, settle, convertInboxItem } = await render();
      q('type-note')!.click();
      await settle();
      await fill(q, settle, 'classify-title', '   ');
      q('classify-convert')!.click();
      await settle();
      expect(q('classify-error')!.textContent).toContain('El título no puede estar vacío');
      await fill(q, settle, 'classify-title', 'x'.repeat(201));
      q('classify-convert')!.click();
      await settle();
      expect(q('classify-error')!.textContent).toContain('demasiado largo');
      expect(convertInboxItem).not.toHaveBeenCalled();
    });

    it('CP-01-22: after converting there is a notice that navigates to the bug or note', async () => {
      const { q, settle, convertInboxItem, navigate } = await render();
      convertInboxItem.mockResolvedValueOnce({
        ok: true,
        type: 'note',
        note: { title: 'Mi nota', slug: 'Guias/Mi nota' } as never,
      });
      q('type-note')!.click();
      await settle();
      q('classify-convert')!.click();
      await settle();
      expect(q('classify-created')!.textContent).toContain('Mi nota');
      q('classify-created-link')!.click();
      expect(navigate).toHaveBeenCalledWith(['wiki'], { queryParams: { note: 'Guias/Mi nota' } });
    });

    it('CP-01-22: converting to a bug shows a notice that opens Bugs e incidencias', async () => {
      const { q, settle, convertInboxItem, navigate } = await render();
      convertInboxItem.mockResolvedValueOnce({
        ok: true,
        type: 'bug',
        bug: { title: 'Falla' } as never,
      });
      q('type-bug')!.click();
      await settle();
      await fill(q, settle, 'classify-symptom', 's');
      await fill(q, settle, 'classify-impact', 'i');
      q('classify-convert')!.click();
      await settle();
      expect(q('classify-created')!.textContent).toContain('Falla');
      q('classify-created-link')!.click();
      expect(navigate).toHaveBeenCalledWith(['bugs'], {});
    });

    it('CP-01-23: the edited title survives switching between Tarea, Bug and Nota', async () => {
      const { q, settle } = await render();
      await fill(q, settle, 'classify-title', 'Título editado');
      for (const type of ['bug', 'note', 'task']) {
        q(`type-${type}`)!.click();
        await settle();
        expect(q<HTMLInputElement>('classify-title')!.value).toBe('Título editado');
      }
    });

    it('CP-01-24: a failure while converting keeps the item and the panel', async () => {
      const { q, settle, convertInboxItem } = await render();
      convertInboxItem.mockRejectedValueOnce(new Error('boom'));
      q('type-note')!.click();
      await settle();
      q('classify-convert')!.click();
      await settle();
      expect(q('classify-error')!.textContent).toContain('No se pudo clasificar');
      expect(q('inbox-item')).not.toBeNull();
    });

    it('CP-01-27: the panel texts come from the locale file', async () => {
      const { q, settle } = await render();
      for (const type of ['bug', 'note']) {
        q(`type-${type}`)!.click();
        await settle();
        expect(q('classify-panel')!.textContent).not.toMatch(/inbox\.|bugs\.|wiki\./);
      }
    });
  });

  it('CP-07-07: tags added in the Clasificar panel are sent with the conversion', async () => {
    const { q, settle, convertInboxItem } = await render();
    const input = q<HTMLInputElement>('tag-input')!;
    input.value = '#Infra';
    input.dispatchEvent(new Event('input'));
    q('tag-add')!.click();
    await settle();
    q('classify-convert')!.click();
    await settle();
    expect(convertInboxItem).toHaveBeenCalledWith(1, {
      type: 'task',
      input: expect.objectContaining({ tags: ['infra'] }),
    });
  });

  it('CP-07-07: the panel suggests existing tags while typing', async () => {
    const { q, settle } = await render();
    const input = q<HTMLInputElement>('tag-input')!;
    input.value = 'in';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(q('tag-suggestion')?.textContent?.trim()).toBe('#infra');
  });
});
