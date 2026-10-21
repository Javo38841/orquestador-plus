import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { TagsEditor } from './tags-editor';

async function render(known: string[] = []) {
  await TestBed.configureTestingModule({
    imports: [
      TagsEditor,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(TagsEditor);
  fixture.componentRef.setInput('known', known);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const input = () => el.querySelector<HTMLInputElement>('[data-testid="tag-input"]')!;
  const type = (value: string) => {
    input().value = value;
    input().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  return { fixture, el, input, type };
}

describe('TagsEditor', () => {
  it('CP-07-02: Enter adds the normalized tag and clears the input', async () => {
    const { fixture, input, type } = await render();
    type('#Infra');
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.tags()).toEqual(['infra']);
    expect(input().value).toBe('');
  });

  it('CP-07-03: flush rejects an invalid pending tag and ignores empty input', async () => {
    const { fixture, type } = await render();
    expect(fixture.componentInstance.flush()).toBeNull();
    type('dos palabras');
    expect(fixture.componentInstance.flush()).toBe('tags.errors.spaces');
    expect(fixture.componentInstance.tags()).toEqual([]);
  });

  it('CP-07-06: suggestions come from known tags that start with the typed text', async () => {
    const { el, type } = await render(['infra', 'api']);
    type('in');
    const items = [...el.querySelectorAll('[data-testid="tag-suggestion"]')];
    expect(items.map((i) => i.textContent?.trim())).toEqual(['#infra']);
  });
});
