import path from 'node:path';
import type { ReleaseChannel } from '../shared/ipc';

export const CHANNEL: ReleaseChannel = __CHANNEL__;

/** Dev and prod builds use different names so they never share user data. */
export function appNameFor(channel: ReleaseChannel): string {
  return channel === 'dev' ? 'OrquestadorPlus Dev' : 'OrquestadorPlus';
}

/**
 * Folder that holds `datos.db`. `ORQ_DATA_DIR` overrides it (used by E2E tests
 * to run against a throwaway folder).
 */
export function resolveDataDir(
  appDataDir: string,
  channel: ReleaseChannel,
  override: string | undefined,
): string {
  if (override) return path.resolve(override);
  return path.join(appDataDir, appNameFor(channel));
}
