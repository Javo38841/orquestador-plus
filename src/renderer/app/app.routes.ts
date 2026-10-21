import { Routes } from '@angular/router';
import { InboxPage } from './features/inbox/inbox-page';
import { TasksPage } from './features/tasks/tasks-page';
import { SectionPage } from './features/section-page/section-page';
import { NAVIGATION } from './layout/navigation';

const sectionRoutes: Routes = NAVIGATION.flatMap((group) => group.items)
  .filter((item) => item.path !== 'inbox' && item.path !== 'tasks')
  .map((item) => ({
    path: item.path,
    component: SectionPage,
    data: { titleKey: item.labelKey, subtitleKey: `pages.${item.path}` },
  }));

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'today' },
  { path: 'inbox', component: InboxPage },
  { path: 'tasks', component: TasksPage },
  ...sectionRoutes,
  { path: '**', redirectTo: 'today' },
];
