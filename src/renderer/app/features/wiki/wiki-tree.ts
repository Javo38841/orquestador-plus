import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
} from '@angular/core';
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

/** Creates a page in a section; resolves to the locale key of the error, or null on success. */
export type PageCreator = (section: string, title: string) => Promise<string | null>;

/**
 * Sidebar tree of the Wiki: collapsible sections and their pages, each section with a "+" to add
 * a page to it. Keyboard (RNF-06): arrows move, Enter opens a page or toggles a section, ← / →
 * fold and unfold. Folding never changes the open page; a folded section holding it is marked.
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
        <li role="none" class="pt-3 first:pt-0" data-testid="wiki-section">
          <div class="flex items-center gap-1">
            <button
              type="button"
              role="treeitem"
              class="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left font-semibold outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent"
              [class.text-ink]="!marksCurrent(section.name)"
              [class.text-accent]="marksCurrent(section.name)"
              [attr.data-key]="sectionKey(section.name)"
              [attr.aria-expanded]="!isCollapsed(section.name)"
              [attr.data-contains-current]="marksCurrent(section.name) ? 'true' : null"
              [attr.title]="
                marksCurrent(section.name) ? ('wiki.containsCurrent' | transloco) : null
              "
              aria-selected="false"
              [attr.tabindex]="tabKey() === sectionKey(section.name) ? 0 : -1"
              data-testid="wiki-section-toggle"
              (click)="toggle(section.name)"
            >
              <span class="truncate">{{ section.title }}</span>
              <span aria-hidden="true" class="w-3 shrink-0 text-xs text-muted">{{
                isCollapsed(section.name) ? '▸' : '▾'
              }}</span>
            </button>
            <button
              type="button"
              class="rounded-md px-2 py-1 text-muted outline-none hover:bg-surface hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
              [attr.aria-label]="'wiki.addPage' | transloco: { section: section.title }"
              [attr.title]="'wiki.addPage' | transloco: { section: section.title }"
              data-testid="wiki-add-page"
              (click)="startAdding(section.name)"
            >
              +
            </button>
          </div>
          @if (adding() === section.name) {
            <form
              class="mt-1 space-y-1 pl-3"
              data-testid="new-page-form"
              (submit)="$event.preventDefault(); addPage(section.name, title.value)"
            >
              <input
                #title
                type="text"
                class="w-full rounded-md border border-line bg-canvas px-2 py-1 text-ink outline-none focus:border-accent"
                [attr.aria-label]="'wiki.pageTitle' | transloco"
                [placeholder]="'wiki.pageTitle' | transloco"
                data-testid="new-page-title"
                (input)="pageError.set(null)"
                (keydown.escape)="$event.preventDefault(); cancelAdding()"
              />
              @if (pageError(); as key) {
                <p class="text-xs text-warn" role="alert" data-testid="new-page-error">
                  {{ key | transloco }}
                </p>
              }
            </form>
          }
          @if (!isCollapsed(section.name)) {
            <ul role="group" class="mt-0.5 space-y-0.5 pl-3">
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
  /** Called by the "+" of a section; without it the "+" does nothing. */
  readonly createPage = input<PageCreator | null>(null);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  /** Section whose "+" form is open. */
  protected readonly adding = signal<string | null>(null);
  protected readonly pageError = signal<string | null>(null);
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

  /** Section that holds the open page. */
  private readonly currentSection = computed(() => {
    const slug = this.currentSlug();
    return this.tree().sections.find((s) => s.pages.some((p) => p.slug === slug))?.name ?? null;
  });

  protected isCollapsed(name: string): boolean {
    return this.collapsed().has(name);
  }

  /** A folded section hides the open page, so its heading shows that it holds it. */
  protected marksCurrent(name: string): boolean {
    return this.isCollapsed(name) && this.currentSection() === name;
  }

  protected startAdding(name: string): void {
    this.pageError.set(null);
    this.adding.set(name);
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLElement>('[data-testid="new-page-title"]')
          ?.focus(),
      { injector: this.injector },
    );
  }

  protected cancelAdding(): void {
    this.adding.set(null);
    this.pageError.set(null);
  }

  protected async addPage(section: string, title: string): Promise<void> {
    const create = this.createPage();
    if (!create) return;
    const error = await create(section, title);
    if (error) {
      this.pageError.set(error);
      return;
    }
    this.cancelAdding();
    this.setCollapsed(section, false);
  }

  protected toggle(name: string): void {
    this.setCollapsed(name, !this.collapsed().has(name));
  }

  protected itemClass(current: boolean): string {
    return (
      'w-full rounded-md px-2 py-1.5 text-left break-words outline-none focus-visible:ring-2 focus-visible:ring-accent ' +
      (current ? 'bg-accent font-semibold text-accent-ink' : 'text-ink/80 hover:bg-surface')
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
