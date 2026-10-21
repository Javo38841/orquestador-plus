/** Local-network report portal (RF-15): contracts and validation shared by main and renderer. */

export const PORTAL_PREFERRED_PORT = 47615;
export const PORTAL_NAME_MAX_LENGTH = 80;
/** A report becomes an inbox item, whose title is capped like a quick capture. */
export const PORTAL_DESCRIPTION_MAX_LENGTH = 500;
/** Largest request body the portal reads, in bytes. */
export const PORTAL_BODY_MAX_BYTES = 8 * 1024;

export const PORTAL_DEFAULT_EXPIRY_HOURS = 24;
export const PORTAL_MAX_EXPIRY_HOURS = 24 * 30;
export const PORTAL_DEFAULT_MAX_SUBMISSIONS = 20;
export const PORTAL_MAX_SUBMISSIONS = 500;

export type PortalLinkStatus = 'active' | 'expired' | 'revoked' | 'exhausted';

export interface PortalLink {
  id: number;
  token: string;
  projectId: number | null;
  projectName: string | null;
  /** ISO-8601 UTC timestamps. */
  createdAt: string;
  expiresAt: string;
  maxSubmissions: number;
  submissions: number;
  status: PortalLinkStatus;
}

export interface PortalLinkInput {
  projectId: number | null;
  expiresInHours: number;
  maxSubmissions: number;
}

export type PortalLinkError = 'invalid_project' | 'invalid_expiry' | 'invalid_limit';

export type PortalLinkResult =
  { ok: true; link: PortalLink } | { ok: false; error: PortalLinkError };

export interface PortalStatus {
  running: boolean;
  port: number | null;
  /** Base URLs (`http://ip:port`) reachable from the local network; empty while off. */
  urls: string[];
}

export type ReportError =
  'empty_name' | 'name_too_long' | 'empty_description' | 'description_too_long';

/** Trims and checks what a visitor submitted; both fields are required. */
export function validateReport(
  name: unknown,
  description: unknown,
): { ok: true; name: string; description: string } | { ok: false; error: ReportError } {
  const who = typeof name === 'string' ? name.trim() : '';
  const text = typeof description === 'string' ? description.trim() : '';
  if (who.length === 0) return { ok: false, error: 'empty_name' };
  if (who.length > PORTAL_NAME_MAX_LENGTH) return { ok: false, error: 'name_too_long' };
  if (text.length === 0) return { ok: false, error: 'empty_description' };
  if (text.length > PORTAL_DESCRIPTION_MAX_LENGTH) {
    return { ok: false, error: 'description_too_long' };
  }
  return { ok: true, name: who, description: text };
}

function isIntInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** Checks the shape and limits of a new link; whether the project exists is checked by main. */
export function validateLinkInput(
  input: unknown,
): { ok: true; value: PortalLinkInput } | { ok: false; error: PortalLinkError } {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const projectId = raw['projectId'] ?? null;
  if (projectId !== null && !isIntInRange(projectId, 1, Number.MAX_SAFE_INTEGER)) {
    return { ok: false, error: 'invalid_project' };
  }
  if (!isIntInRange(raw['expiresInHours'], 1, PORTAL_MAX_EXPIRY_HOURS)) {
    return { ok: false, error: 'invalid_expiry' };
  }
  if (!isIntInRange(raw['maxSubmissions'], 1, PORTAL_MAX_SUBMISSIONS)) {
    return { ok: false, error: 'invalid_limit' };
  }
  return {
    ok: true,
    value: {
      projectId: projectId as number | null,
      expiresInHours: raw['expiresInHours'] as number,
      maxSubmissions: raw['maxSubmissions'] as number,
    },
  };
}
