import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import es from '../../../../../locales/es.json';
import {
  draftError,
  draftFromRule,
  EMPTY_RECURRENCE,
  RecurrenceEditor,
  ruleFromDraft,
  type RecurrenceDraft,
} from './recurrence-editor';

async function render(value: RecurrenceDraft) {
  await TestBed.configureTestingModule({
    imports: [
      RecurrenceEditor,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(RecurrenceEditor);
  fixture.componentRef.setInput('value', value);
  const emitted: RecurrenceDraft[] = [];
  fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const has = (id: string) => el.querySelector(`[data-testid="${id}"]`) !== null;
  return { fixture, el, has, emitted };
}

describe('RecurrenceEditor', () => {
  it('CP-06-13: "Una vez" and "Diaria" show no extra fields', async () => {
    for (const kind of ['once', 'daily'] as const) {
      TestBed.resetTestingModule();
      const { has } = await render({ ...EMPTY_RECURRENCE, kind });
      expect(has('recurrence-kind')).toBe(true);
      expect(has('recurrence-weekday')).toBe(false);
      expect(has('recurrence-month-day')).toBe(false);
    }
  });

  it('CP-06-13: "Semanal" shows only the weekday and "Mensual" only the day of the month', async () => {
    const weekly = await render({ ...EMPTY_RECURRENCE, kind: 'weekly' });
    expect(weekly.has('recurrence-weekday')).toBe(true);
    expect(weekly.has('recurrence-month-day')).toBe(false);

    TestBed.resetTestingModule();
    const monthly = await render({ ...EMPTY_RECURRENCE, kind: 'monthly' });
    expect(monthly.has('recurrence-weekday')).toBe(false);
    expect(monthly.has('recurrence-month-day')).toBe(true);
  });

  it('CP-06-13: every label comes from locales/es.json', async () => {
    const { el } = await render({ ...EMPTY_RECURRENCE, kind: 'weekly' });
    const text = el.textContent!;
    for (const label of [
      es.recurrence.label,
      es.recurrence.weekday,
      es.recurrence.kinds.once,
      es.recurrence.kinds.daily,
      es.recurrence.kinds.weekly,
      es.recurrence.kinds.monthly,
      es.recurrence.weekdays['5'],
    ]) {
      expect(text).toContain(label);
    }
  });

  it('emits the new draft when the kind changes', async () => {
    const { el, fixture, emitted } = await render(EMPTY_RECURRENCE);
    const select = el.querySelector<HTMLSelectElement>('[data-testid="recurrence-kind"]')!;
    select.value = 'monthly';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(emitted).toEqual([{ ...EMPTY_RECURRENCE, kind: 'monthly' }]);
  });

  it('converts between drafts and rules, flagging the incomplete ones', () => {
    expect(ruleFromDraft(draftFromRule({ kind: 'weekly', weekday: 5 }))).toEqual({
      kind: 'weekly',
      weekday: 5,
    });
    expect(ruleFromDraft(draftFromRule({ kind: 'monthly', monthDay: 31 }))).toEqual({
      kind: 'monthly',
      monthDay: 31,
    });
    expect(draftError({ ...EMPTY_RECURRENCE, kind: 'weekly' })).toBe('recurrence_weekday');
    expect(draftError({ ...EMPTY_RECURRENCE, kind: 'monthly', monthDay: '32' })).toBe(
      'recurrence_month_day',
    );
    expect(draftError({ ...EMPTY_RECURRENCE, kind: 'daily' })).toBeNull();
  });
});
