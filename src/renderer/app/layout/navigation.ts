export interface NavItem {
  path: string;
  labelKey: string;
}

export interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

/** Sidebar layout from docs/diseno/pantallas.pdf. */
export const NAVIGATION: NavGroup[] = [
  {
    labelKey: 'nav.groups.main',
    items: [
      { path: 'today', labelKey: 'nav.today' },
      { path: 'inbox', labelKey: 'nav.inbox' },
      { path: 'tasks', labelKey: 'nav.tasks' },
      { path: 'board', labelKey: 'nav.board' },
    ],
  },
  {
    labelKey: 'nav.groups.records',
    items: [
      { path: 'bugs', labelKey: 'nav.bugs' },
      { path: 'wiki', labelKey: 'nav.wiki' },
      { path: 'journal', labelKey: 'nav.journal' },
    ],
  },
  {
    labelKey: 'nav.groups.more',
    items: [
      { path: 'snippets', labelKey: 'nav.snippets' },
      { path: 'learning', labelKey: 'nav.learning' },
      { path: 'portal', labelKey: 'nav.portal' },
      { path: 'settings', labelKey: 'nav.settings' },
    ],
  },
];
