import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  sectionChain,
  type NoteSummary,
  type WikiSection,
  type WikiTree,
} from '../../../../shared/wiki';

/** A line of the sidebar: a page or a section heading, at some depth (0 = the root of the wiki). */
type Row =
  | { key: string; kind: 'page'; depth: number; parent: string | null; page: NoteSummary }
  | { key: string; kind: 'section'; depth: number; parent: string | null; section: WikiSection };

/** `dropTarget` value of the root zone; no section path can look like this. */
const ROOT_DROP = '/root';
/** Time over a folded section before it unfolds while dragging. */
export const EXPAND_ON_DRAG_MS = 600;
/** Type of the drag payload, so only pages of the tree are accepted. */
const DRAG_TYPE = 'application/x-orquestador-page';

const pageKey = (slug: string): string => `p:${slug}`;
const sectionKey = (name: string): string => `s:${name}`;

/** Creates a page in a section; resolves to the locale key of the error, or null on success. */
export type PageCreator = (section: string, title: string) => Promise<string | null>;

/** Creates a section inside another; resolves to the locale key of the error, or null on success. */
export type SectionCreator = (parent: string, title: string) => Promise<string | null>;

/** What the inline form under a section creates. */
type Adding = { section: string; kind: 'page' | 'section' };

/**
 * Sidebar tree of the Wiki: collapsible sections at any depth, each indented one step more than the one
 * it sits in, and their pages. Each section has a "+" to add a page and a button to add a section inside
 * it. Keyboard (RNF-06): arrows move, Enter opens a page or toggles a section, ← / → fold and unfold.
 * Folding never changes the open page; a folded section holding it (at any depth) is marked, and
 * opening a page unfolds the sections above it.
 */
@Component({
  selector: 'app-wiki-tree',
  imports: [NgTemplateOutlet, TranslocoPipe],
  host: { '(keydown)': 'onKeydown($event)', '(focusin)': 'onFocusin($event)' },
  template: `
    @if (dragging()) {
      <div
        class="mb-2 rounded-md border border-dashed px-2 py-1.5 text-xs text-muted"
        [class.border-accent]="dropTarget() === ROOT"
        [class.bg-surface]="dropTarget() === ROOT"
        [class.border-line]="dropTarget() !== ROOT"
        data-testid="wiki-root-drop"
        [attr.data-drop-over]="dropTarget() === ROOT ? 'true' : null"
        (dragover)="onDragOver($event, ROOT)"
        (dragleave)="onDragLeave(ROOT)"
        (drop)="onDrop($event, null)"
      >
        {{ 'wiki.move.dropRoot' | transloco }}
      </div>
    }
    <ul role="tree" [attr.aria-label]="'wiki.sidebar' | transloco" class="space-y-0.5 text-sm">
      @for (page of tree().pages; track page.slug) {
        <ng-container *ngTemplateOutlet="pageTpl; context: { $implicit: page, depth: 0 }" />
      }
      <ng-container
        *ngTemplateOutlet="sectionsTpl; context: { $implicit: tree().sections, depth: 0 }"
      />
    </ul>

    <ng-template #pageTpl let-page let-depth="depth">
      <li role="none" class="group">
        <div class="flex items-center gap-1">
          <button
            type="button"
            role="treeitem"
            draggable="true"
            [class]="itemClass(page.slug === currentSlug())"
            [class.opacity-50]="dragging() === page.slug"
            [attr.data-key]="pageKey(page.slug)"
            [attr.aria-level]="depth + 1"
            [attr.aria-current]="page.slug === currentSlug() ? 'page' : null"
            [attr.aria-selected]="page.slug === currentSlug()"
            [attr.tabindex]="tabKey() === pageKey(page.slug) ? 0 : -1"
            data-testid="note-item"
            (click)="opened.emit(page.slug)"
            (dragstart)="onDragStart($event, page.slug)"
            (dragend)="endDrag()"
          >
            {{ page.title }}
          </button>
          <button
            type="button"
            class="rounded-md px-1.5 py-1 text-xs text-muted opacity-0 outline-none hover:bg-surface hover:text-ink focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent group-focus-within:opacity-100 group-hover:opacity-100"
            [attr.aria-label]="'wiki.move.button' | transloco: { page: page.title }"
            [attr.title]="'wiki.move.title' | transloco"
            data-testid="note-move"
            (click)="startMoving(page.slug)"
          >
            ⇄
          </button>
        </div>
        @if (moving() === page.slug) {
          <form
            class="mt-1 space-y-1 pl-3"
            data-testid="move-form"
            (submit)="$event.preventDefault(); confirmMove(target.value)"
            (keydown.escape)="$event.preventDefault(); $event.stopPropagation(); cancelMoving()"
          >
            <select
              #target
              class="w-full rounded-md border border-line bg-canvas px-2 py-1 text-ink outline-none focus:border-accent"
              [attr.aria-label]="'wiki.move.target' | transloco: { page: page.title }"
              data-testid="move-target"
            >
              @for (option of moveOptions(page.slug); track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
            <div class="flex gap-2">
              <button
                type="submit"
                class="rounded-md bg-accent px-2 py-1 text-xs font-semibold text-accent-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
                data-testid="move-confirm"
              >
                {{ 'wiki.move.confirm' | transloco }}
              </button>
              <button
                type="button"
                class="rounded-md border border-line px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent"
                data-testid="move-cancel"
                (click)="cancelMoving()"
              >
                {{ 'wiki.move.cancel' | transloco }}
              </button>
            </div>
          </form>
        }
      </li>
    </ng-template>

    <ng-template #sectionsTpl let-sections let-depth="depth">
      @for (section of sections; track section.name) {
        <li
          role="none"
          [class]="depth === 0 ? 'pt-3 first:pt-0' : 'pt-1'"
          data-testid="wiki-section"
          [attr.data-depth]="depth"
        >
          <div
            class="flex items-center gap-1 rounded-md"
            [class.ring-2]="dropTarget() === section.name"
            [class.ring-accent]="dropTarget() === section.name"
            [class.bg-surface]="dropTarget() === section.name"
            [attr.data-drop-over]="dropTarget() === section.name ? 'true' : null"
            data-testid="wiki-section-row"
            (dragover)="onDragOver($event, section.name)"
            (dragleave)="onDragLeave(section.name)"
            (drop)="onDrop($event, section.name)"
          >
            <button
              type="button"
              role="treeitem"
              class="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left font-semibold outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent"
              [class.text-ink]="!marksCurrent(section.name)"
              [class.text-accent]="marksCurrent(section.name)"
              [attr.data-key]="sectionKey(section.name)"
              [attr.aria-level]="depth + 1"
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
              (click)="startAdding(section.name, 'page')"
            >
              +
            </button>
            <button
              type="button"
              class="rounded-md px-1.5 py-1 text-xs text-muted outline-none hover:bg-surface hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
              [attr.aria-label]="'wiki.addSubsection' | transloco: { section: section.title }"
              [attr.title]="'wiki.addSubsection' | transloco: { section: section.title }"
              data-testid="wiki-add-subsection"
              (click)="startAdding(section.name, 'section')"
            >
              ▢+
            </button>
          </div>
          @if (adding(); as form) {
            @if (form.section === section.name) {
              <form
                class="mt-1 space-y-1 pl-3"
                [attr.data-testid]="form.kind === 'page' ? 'new-page-form' : 'new-subsection-form'"
                (submit)="$event.preventDefault(); submitAdding(title.value)"
              >
                <input
                  #title
                  type="text"
                  class="w-full rounded-md border border-line bg-canvas px-2 py-1 text-ink outline-none focus:border-accent"
                  [attr.aria-label]="
                    (form.kind === 'page' ? 'wiki.pageTitle' : 'wiki.sectionName') | transloco
                  "
                  [placeholder]="
                    (form.kind === 'page' ? 'wiki.pageTitle' : 'wiki.sectionName') | transloco
                  "
                  [attr.data-testid]="
                    form.kind === 'page' ? 'new-page-title' : 'new-subsection-name'
                  "
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
          }
          @if (!isCollapsed(section.name)) {
            <ul role="group" class="mt-0.5 space-y-0.5 pl-3">
              @for (page of section.pages; track page.slug) {
                <ng-container
                  *ngTemplateOutlet="pageTpl; context: { $implicit: page, depth: depth + 1 }"
                />
              }
              <ng-container
                *ngTemplateOutlet="
                  sectionsTpl;
                  context: { $implicit: section.sections, depth: depth + 1 }
                "
              />
            </ul>
          }
        </li>
      }
    </ng-template>
  `,
})
export class WikiTreeComponent {
  readonly tree = input.required<WikiTree>();
  /** Slug of the open page, highlighted. */
  readonly currentSlug = input<string | null>(null);
  readonly opened = output<string>();
  /** A page was dropped on a section, or confirmed in "Mover a…"; `section` is null for the root. */
  readonly moved = output<{ slug: string; section: string | null }>();
  /** Called by the "+" of a section; without it the "+" does nothing. */
  readonly createPage = input<PageCreator | null>(null);
  /** Called by the "new section inside" button of a section; without it that button does nothing. */
  readonly createSection = input<SectionCreator | null>(null);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly transloco = inject(TranslocoService);
  /** The section whose inline form is open, and what it creates. */
  protected readonly adding = signal<Adding | null>(null);
  protected readonly pageError = signal<string | null>(null);
  private readonly collapsed = signal<ReadonlySet<string>>(new Set());
  /** Slug of the page being dragged. */
  protected readonly dragging = signal<string | null>(null);
  /** Section (or `ROOT`) under the pointer while dragging. */
  protected readonly dropTarget = signal<string | null>(null);
  /** Slug of the page whose "Mover a…" form is open. */
  protected readonly moving = signal<string | null>(null);
  private expandTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly ROOT = ROOT_DROP;
  /** The row that last had focus: the one reachable with Tab. */
  private readonly focused = signal<string | null>(null);

  protected readonly pageKey = pageKey;
  protected readonly sectionKey = sectionKey;

  /** Section that holds each page, by slug. */
  private readonly sectionOfPage = computed(() => {
    const found = new Map<string, string>();
    const visit = (sections: WikiSection[]): void => {
      for (const s of sections) {
        for (const p of s.pages) found.set(p.slug, s.name);
        visit(s.sections);
      }
    };
    visit(this.tree().sections);
    return found;
  });

  /** Rows in the order they are shown, without what is inside folded sections. */
  private readonly rows = computed<Row[]>(() => {
    const tree = this.tree();
    const collapsed = this.collapsed();
    const rows: Row[] = tree.pages.map((page) => ({
      key: pageKey(page.slug),
      kind: 'page',
      depth: 0,
      parent: null,
      page,
    }));
    const visit = (sections: WikiSection[], depth: number, parent: string | null): void => {
      for (const section of sections) {
        const key = sectionKey(section.name);
        rows.push({ key, kind: 'section', depth, parent, section });
        if (collapsed.has(section.name)) continue;
        for (const page of section.pages) {
          rows.push({ key: pageKey(page.slug), kind: 'page', depth: depth + 1, parent: key, page });
        }
        visit(section.sections, depth + 1, key);
      }
    };
    visit(tree.sections, 0, null);
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
    return slug === null ? null : (this.sectionOfPage().get(slug) ?? null);
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.expandTimer !== null) clearTimeout(this.expandTimer);
    });
    // Landing on a page (a link, the search, Anterior / Siguiente) shows it: the folders above it unfold.
    effect(() => {
      const section = this.currentSection();
      if (section === null) return;
      untracked(() => {
        const open = sectionChain(section).filter((s) => this.collapsed().has(s));
        if (open.length === 0) return;
        const next = new Set(this.collapsed());
        for (const s of open) next.delete(s);
        this.collapsed.set(next);
      });
    });
  }

  protected isCollapsed(name: string): boolean {
    return this.collapsed().has(name);
  }

  /** A folded section hides the open page, however deep, so its heading shows that it holds it. */
  protected marksCurrent(name: string): boolean {
    const current = this.currentSection();
    return (
      this.isCollapsed(name) &&
      current !== null &&
      (current === name || current.startsWith(`${name}/`))
    );
  }

  protected startAdding(section: string, kind: Adding['kind']): void {
    this.pageError.set(null);
    this.adding.set({ section, kind });
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLElement>(
            '[data-testid="new-page-title"], [data-testid="new-subsection-name"]',
          )
          ?.focus(),
      { injector: this.injector },
    );
  }

  protected cancelAdding(): void {
    this.adding.set(null);
    this.pageError.set(null);
  }

  protected async submitAdding(title: string): Promise<void> {
    const form = this.adding();
    if (!form) return;
    const create = form.kind === 'page' ? this.createPage() : this.createSection();
    if (!create) return;
    const error = await create(form.section, title);
    if (error) {
      this.pageError.set(error);
      return;
    }
    this.cancelAdding();
    this.setCollapsed(form.section, false);
  }

  protected onDragStart(event: DragEvent, slug: string): void {
    event.dataTransfer?.setData(DRAG_TYPE, slug);
    event.dataTransfer?.setData('text/plain', slug);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    this.dragging.set(slug);
  }

  protected endDrag(): void {
    this.dragging.set(null);
    this.setDropTarget(null);
  }

  protected onDragOver(event: DragEvent, target: string): void {
    if (this.dragging() === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.setDropTarget(target);
  }

  protected onDragLeave(target: string): void {
    if (this.dropTarget() === target) this.setDropTarget(null);
  }

  protected onDrop(event: DragEvent, section: string | null): void {
    const slug = this.dragging();
    if (slug === null) return;
    event.preventDefault();
    this.endDrag();
    this.moved.emit({ slug, section });
  }

  /** Highlights the section under the pointer; a folded one unfolds if the pointer stays on it. */
  private setDropTarget(target: string | null): void {
    if (this.dropTarget() === target) return;
    this.dropTarget.set(target);
    if (this.expandTimer !== null) clearTimeout(this.expandTimer);
    this.expandTimer = null;
    if (target === null || target === ROOT_DROP || !this.collapsed().has(target)) return;
    this.expandTimer = setTimeout(() => {
      this.expandTimer = null;
      this.setCollapsed(target, false);
    }, EXPAND_ON_DRAG_MS);
  }

  protected startMoving(slug: string): void {
    this.moving.set(slug);
    afterNextRender(
      () =>
        this.host.nativeElement.querySelector<HTMLElement>('[data-testid="move-target"]')?.focus(),
      { injector: this.injector },
    );
  }

  protected cancelMoving(): void {
    const slug = this.moving();
    this.moving.set(null);
    if (slug) this.focus(pageKey(slug));
  }

  protected confirmMove(value: string): void {
    const slug = this.moving();
    if (!slug) return;
    this.moving.set(null);
    this.moved.emit({ slug, section: value === '' ? null : value });
    this.focus(pageKey(slug));
  }

  /** Destinations for "Mover a…": the root, then every section with its path of titles. */
  protected moveOptions(slug: string): { value: string; label: string }[] {
    const here = this.sectionOfPage().get(slug) ?? '';
    const options: { value: string; label: string }[] = [];
    const visit = (sections: WikiSection[], trail: string[]): void => {
      for (const s of sections) {
        const path = [...trail, s.title];
        options.push({ value: s.name, label: path.join(' / ') });
        visit(s.sections, path);
      }
    };
    options.push({ value: '', label: this.transloco.translate('wiki.move.root') });
    visit(this.tree().sections, []);
    return options.filter((o) => o.value !== here);
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
    const target = event.target as HTMLElement;
    // Typing in a form of the tree is not tree navigation.
    if (target.tagName === 'INPUT') return;
    const key = target.closest('[data-key]')?.getAttribute('data-key');
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
          if (row.kind === 'section' && !this.collapsed().has(name)) this.setCollapsed(name, true);
          else if (row.parent) this.focus(row.parent);
          return true;
        case 'm':
        case 'M':
          if (row.kind !== 'page') return false;
          this.startMoving(name);
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
