import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { routes } from './app.routes';
import { AppInfoStore } from './core/app-info.store';
import { BugsStore } from './features/bugs/bugs.store';
import { InboxStore } from './features/inbox/inbox.store';
import { BundledTranslocoLoader } from './i18n/transloco-loader';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideTransloco({
      config: {
        availableLangs: ['es'],
        defaultLang: 'es',
        fallbackLang: 'es',
        reRenderOnLangChange: false,
        prodMode: !isDevMode(),
      },
      loader: BundledTranslocoLoader,
    }),
    provideAppInitializer(() => inject(AppInfoStore).load()),
    provideAppInitializer(() => inject(InboxStore).load()),
    provideAppInitializer(() => inject(BugsStore).load()),
  ],
};
