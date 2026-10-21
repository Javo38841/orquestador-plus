import { Routes } from '@angular/router';
import { InboxPage } from './features/inbox/inbox-page';
import { TodayPage } from './features/today/today-page';
import { TasksPage } from './features/tasks/tasks-page';
import { SectionPage } from './features/section-page/section-page';
import { NAVIGATION } from './layout/navigation';

const sectionRoutes: Routes = NAVIGATION.flatMap((group) => group.items)
  .filter((item) => !['inbox', 'tasks', 'today'].includes(item.path))
  .map((item) => ({
    path: item.path,
    component: SectionPage,
    data: { titleKey: item.labelKey, subtitleKey: `pages.${item.path}` },
  }));

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'today' },
  { path: 'today', component: TodayPage },
  { path: 'inbox', component: InboxPage },
  { path: 'tasks', component: TasksPage },
  ...sectionRoutes,
  { path: '**', redirectTo: 'today' },
];
