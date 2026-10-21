import { Routes } from '@angular/router';
import { InboxPage } from './features/inbox/inbox-page';
import { TodayPage } from './features/today/today-page';
import { BoardPage } from './features/board/board-page';
import { TasksPage } from './features/tasks/tasks-page';
import { SectionPage } from './features/section-page/section-page';
import { BugsPage } from './features/bugs/bugs-page';
import { JournalPage } from './features/journal/journal-page';
import { SnippetsPage } from './features/snippets/snippets-page';
import { LearningPage } from './features/learning/learning-page';
import { PortalPage } from './features/portal/portal-page';
import { WikiPage } from './features/wiki/wiki-page';
import { NAVIGATION } from './layout/navigation';

const sectionRoutes: Routes = NAVIGATION.flatMap((group) => group.items)
  .filter(
    (item) =>
      ![
        'inbox',
        'tasks',
        'today',
        'board',
        'bugs',
        'journal',
        'wiki',
        'snippets',
        'learning',
        'portal',
      ].includes(item.path),
  )
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
  { path: 'board', component: BoardPage },
  { path: 'bugs', component: BugsPage },
  { path: 'journal', component: JournalPage },
  {
    path: 'wiki',
    component: WikiPage,
    canDeactivate: [(page: WikiPage) => page.confirmLeave()],
  },
  { path: 'snippets', component: SnippetsPage },
  { path: 'learning', component: LearningPage },
  { path: 'portal', component: PortalPage },
  ...sectionRoutes,
  { path: '**', redirectTo: 'today' },
];
