import { computed, inject, Injectable, signal } from '@angular/core';
import type { AppInfo } from '../../../shared/ipc';
import { DESKTOP_API } from './desktop-api';

@Injectable({ providedIn: 'root' })
export class AppInfoStore {
  private readonly api = inject(DESKTOP_API);
  private readonly info = signal<AppInfo | null>(null);

  readonly appInfo = this.info.asReadonly();
  readonly isDev = computed(() => this.info()?.channel === 'dev');
  readonly databaseReady = computed(() => this.info()?.databaseReady ?? false);

  async load(): Promise<void> {
    if (!this.api) return;
    this.info.set(await this.api.getAppInfo());
  }
}
