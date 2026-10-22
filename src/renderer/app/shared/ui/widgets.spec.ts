import { Component, signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { Card } from './card';
import { PrimaryButton } from './primary-button';
import { RelativeDate } from './relative-date';
import { SegmentedTabs, type TabItem } from './segmented-tabs';

const NOW = new Date(2026, 9, 22, 12);

async function setup<T>(component: Type<T>, inputs: Record<string, unknown> = {}) {
  await TestBed.configureTestingModule({
    imports: [
      component,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(component);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('RelativeDate', () => {
  const span = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-testid="relative-date"]');

  it('CP-N17-09: an overdue date reads "Venció ayer" in amber', async () => {
    const { el } = await setup(RelativeDate, { date: '2026-10-21', now: NOW });
    expect(span(el)!.textContent).toBe('Venció ayer');
    expect(span(el)!.classList).toContain('text-warn');
  });

  it('CP-N17-09: several days overdue include the count', async () => {
    const { el } = await setup(RelativeDate, { date: '2026-10-19', now: NOW });
    expect(span(el)!.textContent).toBe('Venció hace 3 días');
  });

  it('CP-N17-10: today shows "Hoy" in the normal text color', async () => {
    const { el } = await setup(RelativeDate, { date: '2026-10-22', now: NOW });
    expect(span(el)!.textContent).toBe('Hoy');
    expect(span(el)!.classList).toContain('text-ink');
    expect(span(el)!.classList).not.toContain('text-warn');
  });

  it('CP-N17-11: a completed task shows its date in gray', async () => {
    const { el } = await setup(RelativeDate, { date: '2026-10-21', done: true, now: NOW });
    expect(span(el)!.classList).toContain('text-muted');
    expect(span(el)!.textContent).not.toContain('Venció');
  });

  it('CP-N17-12: a null date renders nothing and does not throw', async () => {
    const { el } = await setup(RelativeDate, { date: null, now: NOW });
    expect(span(el)).toBeNull();
    expect(el.textContent!.trim()).toBe('');
  });
});

@Component({
  imports: [SegmentedTabs],
  template: `<app-segmented-tabs
    [tabs]="tabs"
    [selected]="selected()"
    (selectedChange)="selected.set($event); changes.push($event)"
  />`,
})
class TabsHost {
  tabs: TabItem[] = [
    { id: 'all', label: 'Todos', count: 4 },
    { id: 'open', label: 'Abiertos', count: 0 },
  ];
  selected = signal('all');
  changes: string[] = [];
}

describe('SegmentedTabs', () => {
  it('CP-N17-13: selecting another tab highlights it and emits the change', async () => {
    const { fixture, el } = await setup(TabsHost);
    const tab = (id: string) => el.querySelector<HTMLButtonElement>(`[data-testid="tab-${id}"]`)!;
    expect(tab('all').textContent!.replace(/\s+/g, ' ').trim()).toBe('Todos · 4');
    expect(tab('all').getAttribute('aria-selected')).toBe('true');
    tab('open').click();
    fixture.detectChanges();
    expect(fixture.componentInstance.changes).toEqual(['open']);
    expect(tab('open').classList).toContain('bg-accent');
    expect(tab('all').classList).not.toContain('bg-accent');
  });

  it('CP-N17-14: a tab with count 0 still shows "0"', async () => {
    const { el } = await setup(TabsHost);
    const open = el.querySelector('[data-testid="tab-open"]')!;
    expect(open.textContent!.replace(/\s+/g, ' ').trim()).toBe('Abiertos · 0');
  });
});

describe('PrimaryButton', () => {
  it('CP-N17-15: shows icon and text in the accent color and emits on click', async () => {
    const { fixture, el } = await setup(PrimaryButton, { label: 'Nueva tarea', icon: '+' });
    const pressed = vi.fn();
    fixture.componentInstance.pressed.subscribe(pressed);
    const button = el.querySelector<HTMLButtonElement>('button')!;
    expect(button.textContent!.replace(/\s+/g, ' ').trim()).toBe('+ Nueva tarea');
    expect(button.classList).toContain('bg-accent');
    expect(button.classList).toContain('text-accent-ink');
    button.click();
    expect(pressed).toHaveBeenCalledTimes(1);
  });
});

@Component({ imports: [Card], template: `<app-card><p>Contenido</p></app-card>` })
class CardHost {}

describe('Card', () => {
  it('CP-N17-16: renders its content on the theme surface and border colors', async () => {
    const { el } = await setup(CardHost);
    const card = el.querySelector<HTMLElement>('[data-testid="card"]')!;
    expect(card.textContent).toContain('Contenido');
    expect(card.classList).toContain('bg-surface');
    expect(card.classList).toContain('border-line');
  });
});
