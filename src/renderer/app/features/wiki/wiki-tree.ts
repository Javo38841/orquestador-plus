import { Component, computed, ElementRef, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { WikiTree } from '../../../../shared/wiki';

interface Row {
  /** `p:<slug>` for a page, `s:<name>` for a section heading. */
  key: string;
  kind: 'page' | 'section';
  /** Key of the section heading a page sits under. */
  parent: string | null;
}

const pageKey = (slug: string): string => `p:${slug}`;
const sectionKey = (name: string): string => `s:${name}`;

/**
 * Sidebar tree of the Wiki: collapsible sections and their pages. Keyboard (RNF-06): arrows move,
 * Enter opens a page or toggles a section, ← / → fold and unfold. Folding never changes the open page.
 */
@Component({
  selector: 'app-wiki-tree',
  imports: [TranslocoPipe],
  host: { '(keydown)': 'onKeydown($event)', '(focusin)': 'onFocusin($event)' },
  template: `
    <ul role="tree" [attr.aria-label]="'wiki.sidebar' | transloco" class="space-y-0.5 text-sm">
      @for (page of tree().pages; track page.slug) {
        <li role="none">
          <button
            type="button"
            role="treeitem"
            [class]="itemClass(page.slug === currentSlug())"
            [attr.data-key]="pageKey(page.slug)"
            [attr.aria-current]="page.slug === currentSlug() ? 'page' : null"
            [attr.aria-selected]="page.slug === currentSlug()"
            [attr.tabindex]="tabKey() === pageKey(page.slug) ? 0 : -1"
            data-testid="note-item"
            (click)="opened.emit(page.slug)"
          >
            {{ page.title }}
          </button>
        </li>
      }
      @for (section of tree().sections; track section.name) {
        <li role="none" data-testid="wiki-section">
          <button
            type="button"
            role="treeitem"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] font-semibold tracking-widest text-muted uppercase outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
            [attr.data-key]="sectionKey(section.name)"
            [attr.aria-expanded]="!isCollapsed(section.name)"
            aria-selected="false"
            [attr.tabindex]="tabKey() === sectionKey(section.name) ? 0 : -1"
            data-testid="wiki-section-toggle"
            (click)="toggle(section.name)"
          >
            <span aria-hidden="true" class="w-3">{{ isCollapsed(section.name) ? '▸' : '▾' }}</span>
            {{ section.title }}
          </button>
          @if (!isCollapsed(section.name)) {
            <ul role="group" class="ml-3 space-y-0.5 border-l border-line pl-2">
              @for (page of section.pages; track page.slug) {
                <li role="none">
                  <button
                    type="button"
                    role="treeitem"
                    [class]="itemClass(page.slug === currentSlug())"
                    [attr.data-key]="pageKey(page.slug)"
                    [attr.aria-current]="page.slug === currentSlug() ? 'page' : null"
                    [attr.aria-selected]="page.slug === currentSlug()"
                    [attr.tabindex]="tabKey() === pageKey(page.slug) ? 0 : -1"
                    data-testid="note-item"
                    (click)="opened.emit(page.slug)"
                  >
                    {{ page.title }}
                  </button>
                </li>
              }
            </ul>
          }
        </li>
      }
    </ul>
  `,
})
export class WikiTreeComponent {
  readonly tree = input.required<WikiTree>();
  /** Slug of the open page, highlighted. */
  readonly currentSlug = input<string | null>(null);
  readonly opened = output<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly collapsed = signal<ReadonlySet<string>>(new Set());
  /** The row that last had focus: the one reachable with Tab. */
  private readonly focused = signal<string | null>(null);

  protected readonly pageKey = pageKey;
  protected readonly sectionKey = sectionKey;

  /** Rows in the order they are shown, without the pages of folded sections. */
  private readonly rows = computed<Row[]>(() => {
    const tree = this.tree();
    const rows: Row[] = tree.pages.map((p) => ({
      key: pageKey(p.slug),
      kind: 'page',
      parent: null,
    }));
    for (const section of tree.sections) {
      const parent = sectionKey(section.name);
      rows.push({ key: parent, kind: 'section', parent: null });
      if (this.collapsed().has(section.name)) continue;
      for (const p of section.pages) rows.push({ key: pageKey(p.slug), kind: 'page', parent });
    }
    return rows;
  });

  /** Tab stop: the focused row if it is still shown, else the open page, else the first row. */
  protected readonly tabKey = computed(() => {
    const keys = this.rows().map((r) => r.key);
    const wanted = [this.focused(), this.currentSlug() && pageKey(this.currentSlug()!)];
    return wanted.find((k) => k && keys.includes(k)) ?? keys[0] ?? null;
  });

  protected isCollapsed(name: string): boolean {
    return this.collapsed().has(name);
  }

  protected toggle(name: string): void {
    this.setCollapsed(name, !this.collapsed().has(name));
  }

  protected itemClass(current: boolean): string {
    return (
      'w-full truncate rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent ' +
      (current ? 'bg-surface-raised font-semibold text-accent' : 'text-ink/80 hover:bg-surface')
    );
  }

  private setCollapsed(name: string, folded: boolean): void {
    const next = new Set(this.collapsed());
    if (folded) next.add(name);
    else next.delete(name);
    this.collapsed.set(next);
  }

  protected onFocusin(event: FocusEvent): void {
    const key = (event.target as HTMLElement).closest('[data-key]')?.getAttribute('data-key');
    if (key) this.focused.set(key);
  }

  private focus(key: string | undefined): void {
    if (!key) return;
    this.focused.set(key);
    this.host.nativeElement.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus();
  }

  protected onKeydown(event: KeyboardEvent): void {
    const key = (event.target as HTMLElement).closest('[data-key]')?.getAttribute('data-key');
    const rows = this.rows();
    const index = rows.findIndex((r) => r.key === key);
    if (index < 0 || event.ctrlKey || event.altKey || event.metaKey) return;
    const row = rows[index];
    const name = row.key.slice(2);
    const handled = ((): boolean => {
      switch (event.key) {
        case 'ArrowDown':
          this.focus(rows[Math.min(index + 1, rows.length - 1)].key);
          return true;
        case 'ArrowUp':
          this.focus(rows[Math.max(index - 1, 0)].key);
          return true;
        case 'Home':
          this.focus(rows[0].key);
          return true;
        case 'End':
          this.focus(rows[rows.length - 1].key);
          return true;
        case 'ArrowRight':
          if (row.kind === 'section') {
            if (this.collapsed().has(name)) this.setCollapsed(name, false);
            else if (rows[index + 1]?.parent === row.key) this.focus(rows[index + 1].key);
          }
          return true;
        case 'ArrowLeft':
          if (row.kind === 'section') {
            if (!this.collapsed().has(name)) this.setCollapsed(name, true);
          } else if (row.parent) this.focus(row.parent);
          return true;
        case 'Enter':
          if (row.kind === 'section') this.toggle(name);
          else this.opened.emit(name);
          return true;
        default:
          return false;
      }
    })();
    if (handled) event.preventDefault();
  }
}
