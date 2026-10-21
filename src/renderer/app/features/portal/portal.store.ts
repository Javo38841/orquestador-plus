import { inject, Injectable, signal } from '@angular/core';
import {
  validateLinkInput,
  type PortalLink,
  type PortalLinkError,
  type PortalLinkInput,
  type PortalStatus,
} from '../../../../shared/portal';
import { DESKTOP_API } from '../../core/desktop-api';

const OFF: PortalStatus = { running: false, port: null, urls: [] };

@Injectable({ providedIn: 'root' })
export class PortalStore {
  private readonly api = inject(DESKTOP_API);
  private readonly state = signal<PortalStatus>(OFF);
  private readonly list = signal<PortalLink[]>([]);

  readonly status = this.state.asReadonly();
  readonly links = this.list.asReadonly();

  async load(): Promise<void> {
    if (!this.api) return;
    this.state.set(await this.api.getPortalStatus());
    this.list.set(await this.api.listPortalLinks());
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (!this.api) return;
    this.state.set(await this.api.setPortalEnabled(enabled));
    // Statuses depend on the clock, so refresh them whenever the portal changes.
    this.list.set(await this.api.listPortalLinks());
  }

  /** Validates locally, creates the link through the API and puts it first. */
  async create(input: PortalLinkInput): Promise<PortalLinkError | null> {
    const checked = validateLinkInput(input);
    if (!checked.ok) return checked.error;
    if (!this.api) return null;
    const result = await this.api.createPortalLink(input);
    if (!result.ok) return result.error;
    this.list.update((links) => [result.link, ...links]);
    return null;
  }

  async revoke(id: number): Promise<void> {
    if (!this.api) return;
    if (await this.api.revokePortalLink(id)) {
      this.list.update((links) =>
        links.map((l) => (l.id === id ? { ...l, status: 'revoked' as const } : l)),
      );
    }
  }

  /** The address to hand out for a link, or null while the portal is off or has no network. */
  addressOf(link: PortalLink): string | null {
    const { running, urls } = this.state();
    return running && urls.length > 0 ? `${urls[0]}/r/${link.token}` : null;
  }
}
