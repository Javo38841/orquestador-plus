import { TestBed } from '@angular/core/testing';
import { BoardCombo } from './board-combo';

async function setup() {
  await TestBed.configureTestingModule({ imports: [BoardCombo] }).compileComponents();
  const fixture = TestBed.createComponent(BoardCombo);
  fixture.componentRef.setInput('options', [
    { value: 'a', label: 'Alfa' },
    { value: 'b', label: 'Beta' },
    { value: 'c', label: 'Gamma' },
  ]);
  fixture.componentRef.setInput('value', 'b');
  fixture.componentRef.setInput('label', 'Tablero');
  fixture.componentRef.setInput('testid', 'combo');
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
  };
  const trigger = () => el.querySelector<HTMLButtonElement>('[data-testid="combo"]')!;
  const options = () => [...el.querySelectorAll<HTMLElement>('[role="option"]')];
  const key = (target: Element, name: string) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
  return { fixture, el, settle, trigger, options, key };
}

describe('BoardCombo', () => {
  afterEach(() => document.body.replaceChildren());

  it('CP-07-08: shows the chosen label, opens a listbox and marks the chosen option', async () => {
    const { trigger, options, settle } = await setup();
    expect(trigger().textContent).toContain('Beta');
    expect(trigger().getAttribute('aria-label')).toBe('Tablero: Beta');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    trigger().click();
    await settle();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(options().map((o) => o.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
    ]);
    expect(options()[1]!.className).toContain('text-accent');
    expect(document.activeElement).toBe(options()[1]);
  });

  it('CP-07-10: arrows move, Enter chooses and closes, and focus returns to the button', async () => {
    const { fixture, trigger, options, settle, key } = await setup();
    const changes: string[] = [];
    fixture.componentInstance.value.subscribe((v) => changes.push(v));
    trigger().click();
    await settle();
    key(options()[1]!, 'ArrowDown');
    expect(document.activeElement).toBe(options()[2]);
    key(options()[2]!, 'ArrowUp');
    key(options()[1]!, 'ArrowUp');
    expect(document.activeElement).toBe(options()[0]);
    key(options()[0]!, 'Enter');
    await settle();
    expect(changes).toEqual(['a']);
    expect(options()).toHaveLength(0);
    expect(document.activeElement).toBe(trigger());
  });

  it('CP-07-10: Escape closes without changing the value and ArrowDown on the button opens it', async () => {
    const { trigger, options, settle, key, fixture } = await setup();
    const changes: string[] = [];
    fixture.componentInstance.value.subscribe((v) => changes.push(v));
    key(trigger(), 'ArrowDown');
    await settle();
    expect(options()).toHaveLength(3);
    key(options()[1]!, 'Escape');
    await settle();
    expect(options()).toHaveLength(0);
    expect(changes).toEqual([]);
    expect(document.activeElement).toBe(trigger());
  });

  it('closes when clicking outside', async () => {
    const { trigger, options, settle } = await setup();
    trigger().click();
    await settle();
    document.body.click();
    await settle();
    expect(options()).toHaveLength(0);
  });
});
