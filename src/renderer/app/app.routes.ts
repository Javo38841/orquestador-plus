import { Routes } from '@angular/router';
import { SectionPage } from './features/section-page/section-page';
import { NAVIGATION } from './layout/navigation';

const sectionRoutes: Routes = NAVIGATION.flatMap((group) => group.items).map((item) => ({
  path: item.path,
  component: SectionPage,
  data: { titleKey: item.labelKey, subtitleKey: `pages.${item.path}` },
}));

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'today' },
  ...sectionRoutes,
  { path: '**', redirectTo: 'today' },
];
