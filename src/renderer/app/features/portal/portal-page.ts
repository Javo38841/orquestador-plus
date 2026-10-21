import { Component, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  PORTAL_DEFAULT_EXPIRY_HOURS,
  PORTAL_DEFAULT_MAX_SUBMISSIONS,
  type PortalLink,
  type PortalLinkError,
} from '../../../../shared/portal';
import { DESKTOP_API } from '../../core/desktop-api';
import { TasksStore } from '../tasks/tasks.store';
import { PortalStore } from './portal.store';

const ERROR_KEYS: Record<PortalLinkError, string> = {
  invalid_project: 'portal.errors.invalidProject',
  invalid_expiry: 'portal.errors.invalidExpiry',
  invalid_limit: 'portal.errors.invalidLimit',
};

const EXPIRY_OPTIONS = [1, 8, 24, 48, 168, 720];

/** Portal de reportes (RF-15): switch, local address and the temporary links. */
@Component({
  selector: 'app-portal-page',
  imports: [TranslocoPipe],
  template: `
    <header class="mb-6">
      <h1 class="text-2xl font-semibold">{{ 'nav.portal' | transloco }}</h1>
      <p class="mt-1 text-sm text-muted">{{ 'pages.portal' | transloco }}</p>
    </header>

    <section class="mb-6 rounded-lg border border-line bg-surface p-4 text-sm">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="font-semibold" data-testid="portal-state">
          {{ (store.status().running ? 'portal.status.on' : 'portal.status.off') | transloco }}
        </p>
        <button
          type="button"
          class="rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink"
          data-testid="portal-toggle"
          (click)="toggle()"
        >
          {{
            (store.status().running ? 'portal.status.turnOff' : 'portal.status.turnOn') | transloco
          }}
        </button>
      </div>
      @if (store.status().running) {
        @if (store.status().urls.length > 0) {
          <p class="mt-3 text-muted">{{ 'portal.status.address' | transloco }}</p>
          <ul class="font-mono" data-testid="portal-address">
            @for (url of store.status().urls; track url) {
              <li>{{ url }}</li>
            }
          </ul>
        } @else {
          <p class="mt-3 text-warn" data-testid="portal-no-network">
            {{ 'portal.status.noNetwork' | transloco }}
          </p>
        }
      } @else {
        <p class="mt-3 text-muted">{{ 'portal.status.offNote' | transloco }}</p>
      }
      @if (statusError()) {
        <p class="mt-3 text-warn" role="alert">{{ 'portal.status.failed' | transloco }}</p>
      }
      <label class="mt-4 flex items-center gap-2 text-muted">
        <input type="checkbox" disabled data-testid="portal-outside" />
        {{ 'portal.outside.label' | transloco }}
        <span class="text-xs">· {{ 'portal.outside.note' | transloco }}</span>
      </label>
    </section>

    <section class="mb-6 rounded-lg border border-line bg-surface p-4 text-sm">
      <h2 class="mb-3 text-lg font-semibold">{{ 'portal.links.create' | transloco }}</h2>
      <form class="flex flex-wrap items-end gap-3" (submit)="$event.preventDefault(); create()">
        <label class="block">
          <span class="text-muted">{{ 'portal.links.project' | transloco }}</span>
          <select
            class="mt-1 block rounded-md border border-line bg-canvas px-3 py-2 text-ink"
            data-testid="link-project"
            (change)="project.set($any($event.target).value)"
          >
            <option value="">{{ 'portal.links.noProject' | transloco }}</option>
            @for (p of tasks.projects(); track p.id) {
              <option [value]="p.id">{{ p.name }}</option>
            }
          </select>
        </label>
        <label class="block">
          <span class="text-muted">{{ 'portal.links.expiry' | transloco }}</span>
          <select
            class="mt-1 block rounded-md border border-line bg-canvas px-3 py-2 text-ink"
            data-testid="link-expiry"
            (change)="expiry.set(+$any($event.target).value)"
          >
            @for (hours of expiryOptions; track hours) {
              <option [value]="hours" [selected]="hours === expiry()">
                {{ 'portal.links.hours' | transloco: { n: hours } }}
              </option>
            }
          </select>
        </label>
        <label class="block">
          <span class="text-muted">{{ 'portal.links.limit' | transloco }}</span>
          <input
            type="number"
            min="1"
            max="500"
            class="mt-1 block w-28 rounded-md border border-line bg-canvas px-3 py-2 text-ink"
            data-testid="link-limit"
            [value]="limit()"
            (input)="limit.set(+$any($event.target).value)"
          />
        </label>
        <button
          type="submit"
          class="rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink"
          data-testid="link-create"
        >
          {{ 'portal.links.create' | transloco }}
        </button>
      </form>
      @if (error(); as key) {
        <p class="mt-3 text-warn" role="alert" data-testid="link-error">{{ key | transloco }}</p>
      }
    </section>

    <h2 class="mb-3 text-lg font-semibold">{{ 'portal.links.title' | transloco }}</h2>
    @if (store.links().length === 0) {
      <p class="rounded-lg border border-line bg-surface px-5 py-4 text-sm text-muted">
        {{ 'portal.links.empty' | transloco }}
      </p>
    } @else {
      <ul class="space-y-2">
        @for (link of store.links(); track link.id) {
          <li
            class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-5 py-3 text-sm"
            data-testid="portal-link"
          >
            <div class="min-w-0">
              <p>
                <span class="font-semibold">{{
                  link.projectName ?? ('portal.links.noProject' | transloco)
                }}</span>
                <span class="ml-2 text-xs text-muted" data-testid="link-status">{{
                  'portal.links.statusLabel.' + link.status | transloco
                }}</span>
              </p>
              <p class="text-xs text-muted">
                {{ 'portal.links.expires' | transloco: { date: day(link) } }} ·
                {{
                  'portal.links.uses'
                    | transloco: { used: link.submissions, max: link.maxSubmissions }
                }}
              </p>
            </div>
            @if (link.status === 'active') {
              <div class="flex gap-2">
                <button
                  type="button"
                  class="rounded-md border border-line px-3 py-1"
                  data-testid="link-copy"
                  [disabled]="store.addressOf(link) === null"
                  (click)="copy(link)"
                >
                  {{
                    (copied() === link.id ? 'portal.links.copied' : 'portal.links.copy') | transloco
                  }}
                </button>
                <button
                  type="button"
                  class="rounded-md border border-warn px-3 py-1 text-warn"
                  data-testid="link-revoke"
                  (click)="store.revoke(link.id)"
                >
                  {{ 'portal.links.revoke' | transloco }}
                </button>
              </div>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class PortalPage implements OnInit {
  protected readonly store = inject(PortalStore);
  protected readonly tasks = inject(TasksStore);
  private readonly api = inject(DESKTOP_API);
  protected readonly expiryOptions = EXPIRY_OPTIONS;
  protected readonly project = signal('');
  protected readonly expiry = signal(PORTAL_DEFAULT_EXPIRY_HOURS);
  protected readonly limit = signal(PORTAL_DEFAULT_MAX_SUBMISSIONS);
  protected readonly error = signal<string | null>(null);
  protected readonly statusError = signal(false);
  protected readonly copied = signal<number | null>(null);

  ngOnInit(): void {
    void this.store.load();
    void this.tasks.load();
  }

  protected day(link: PortalLink): string {
    return link.expiresAt.slice(0, 16).replace('T', ' ');
  }

  protected async toggle(): Promise<void> {
    this.statusError.set(false);
    try {
      await this.store.setEnabled(!this.store.status().running);
    } catch {
      this.statusError.set(true);
    }
  }

  protected async create(): Promise<void> {
    this.error.set(null);
    try {
      const failure = await this.store.create({
        projectId: this.project() === '' ? null : Number(this.project()),
        expiresInHours: this.expiry(),
        maxSubmissions: this.limit(),
      });
      if (failure) this.error.set(ERROR_KEYS[failure]);
    } catch {
      this.error.set('portal.errors.failed');
    }
  }

  protected async copy(link: PortalLink): Promise<void> {
    const address = this.store.addressOf(link);
    if (!address || !this.api) return;
    if (await this.api.copyToClipboard(address)) {
      this.copied.set(link.id);
    } else {
      this.error.set('portal.links.copyFailed');
    }
  }
}
