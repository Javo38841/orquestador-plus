import { Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';
import es from '../../../../locales/es.json';

/** Translations are bundled with the app: no network request is ever made (RNF-01). */
export const TRANSLATIONS: Record<string, Translation> = { es };

@Injectable({ providedIn: 'root' })
export class BundledTranslocoLoader implements TranslocoLoader {
  getTranslation(lang: string): Observable<Translation> {
    return of(TRANSLATIONS[lang] ?? {});
  }
}
