import http from 'node:http';
import os from 'node:os';
import type { AddressInfo } from 'node:net';
import type Database from 'better-sqlite3';
import es from '../../../locales/es.json';
import {
  PORTAL_BODY_MAX_BYTES,
  PORTAL_PREFERRED_PORT,
  validateReport,
  type PortalStatus,
} from '../../shared/portal';
import { submitReport } from './links';

/**
 * The report portal (RF-15, RNF-07). It only ever accepts `POST /reportar` into the inbox
 * and serves one static form. No route reads user data and nothing else is writable.
 */

const texts = es.portal.form;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export interface PortalRequest {
  method: string;
  path: string;
  contentType: string;
  body: string;
}

export interface PortalResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(status: number, title: string, content: string): PortalResponse {
  const body = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#0f1218;color:#e6e8ec;max-width:32rem;margin:2rem auto;padding:0 1rem}
label{display:block;margin-top:1rem}input,textarea{width:100%;box-sizing:border-box;padding:.5rem;background:#1a1f28;color:inherit;border:1px solid #333b49;border-radius:.375rem;font:inherit}
button{margin-top:1rem;padding:.5rem 1rem;background:#3fc9a6;color:#0f1218;border:0;border-radius:.375rem;font-weight:600}a{color:#3fc9a6}</style>
</head><body>${content}</body></html>`;
  return {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
      'cache-control': 'no-store',
    },
    body,
  };
}

function form(token: string): PortalResponse {
  return page(
    200,
    texts.title,
    `<h1>${escapeHtml(texts.title)}</h1><p>${escapeHtml(texts.intro)}</p>
<form method="post" action="/reportar">
<input type="hidden" name="token" value="${token}">
<label>${escapeHtml(texts.name)}<input name="name" maxlength="80" required></label>
<label>${escapeHtml(texts.description)}<textarea name="description" rows="6" maxlength="500" required></textarea></label>
<button type="submit">${escapeHtml(texts.submit)}</button></form>`,
  );
}

type FailureKey = keyof typeof texts.errors;

function json(status: number, payload: object): PortalResponse {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(payload),
  };
}

/** Replies as JSON to API clients and as a small page to the HTML form. */
function reply(request: PortalRequest, status: number, key: FailureKey | null): PortalResponse {
  const asHtml = !request.contentType.startsWith('application/json');
  if (key === null) {
    return asHtml
      ? page(
          status,
          texts.title,
          `<p>${escapeHtml(texts.thanks)}</p><p><a href="javascript:history.back()">${escapeHtml(texts.back)}</a></p>`,
        )
      : json(status, { ok: true });
  }
  return asHtml
    ? page(status, texts.title, `<p>${escapeHtml(texts.errors[key])}</p>`)
    : json(status, { error: key });
}

function parseBody(request: PortalRequest): Record<string, unknown> | null {
  const type = request.contentType.split(';')[0]!.trim().toLowerCase();
  try {
    if (type === 'application/json') {
      const parsed: unknown = JSON.parse(request.body);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    }
    if (type === 'application/x-www-form-urlencoded') {
      return Object.fromEntries(new URLSearchParams(request.body));
    }
  } catch {
    return null;
  }
  return null;
}

/** Pure request handling: everything the portal does, testable without a socket. */
export function handlePortalRequest(
  db: Database.Database,
  request: PortalRequest,
  now: Date = new Date(),
): PortalResponse {
  const path = request.path.split('?')[0]!;

  if (path === '/reportar') {
    if (request.method !== 'POST') {
      return { status: 405, headers: { allow: 'POST' }, body: '' };
    }
    const fields = parseBody(request);
    if (!fields) return reply(request, 400, 'bad_request');
    const token = fields['token'];
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
      return reply(request, 401, 'unauthorized');
    }
    const checked = validateReport(fields['name'], fields['description']);
    const outcome = checked.ok ? submitReport(db, token, checked, now) : null;
    if (outcome && !outcome.ok) {
      switch (outcome.reason) {
        case 'unknown_token':
          return reply(request, 401, 'unauthorized');
        case 'limit':
          return reply(request, 429, 'limit');
        default:
          return reply(request, 403, 'forbidden');
      }
    }
    if (!checked.ok) {
      // Validation runs before the token is looked up, but a bad token must win over a bad body.
      return db.prepare('SELECT 1 FROM portal_links WHERE token = ?').get(token)
        ? reply(request, 400, checked.error)
        : reply(request, 401, 'unauthorized');
    }
    return reply(request, 201, null);
  }

  // The form carries no user data: it is the same page for any well-formed token.
  const formMatch = /^\/r\/([^/]+)$/.exec(path);
  if (request.method === 'GET' && formMatch && TOKEN_PATTERN.test(formMatch[1]!)) {
    return form(formMatch[1]!);
  }
  return { status: 404, headers: {}, body: '' };
}

export interface PortalServer {
  start(): Promise<PortalStatus>;
  stop(): Promise<PortalStatus>;
  status(): PortalStatus;
}

export interface PortalServerOptions {
  db: Database.Database;
  /** Port to try first; 0 lets the system pick. */
  port?: number;
  now?: () => Date;
  /** IPv4 addresses on the local network. */
  addresses?: () => string[];
}

function localAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flatMap((list) => list ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);
}

/** Starts and stops the HTTP listener; while stopped, nothing listens (CP-15-07). */
export function createPortalServer(options: PortalServerOptions): PortalServer {
  const { db } = options;
  const now = options.now ?? (() => new Date());
  const addresses = options.addresses ?? localAddresses;
  const preferredPort = options.port ?? PORTAL_PREFERRED_PORT;
  let server: http.Server | null = null;

  function onRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    const send = (response: PortalResponse): void => {
      res.writeHead(response.status, { ...response.headers, connection: 'close' });
      res.end(response.body);
    };
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > PORTAL_BODY_MAX_BYTES) tooLarge = true;
      else chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        send(json(413, { error: 'too_large' }));
        return;
      }
      try {
        send(
          handlePortalRequest(
            db,
            {
              method: req.method ?? '',
              path: req.url ?? '/',
              contentType: req.headers['content-type'] ?? '',
              body: Buffer.concat(chunks).toString('utf8'),
            },
            now(),
          ),
        );
      } catch {
        send({ status: 500, headers: {}, body: '' });
      }
    });
    req.on('error', () => res.destroy());
  }

  function listen(port: number): Promise<http.Server> {
    return new Promise((resolve, reject) => {
      const candidate = http.createServer(onRequest);
      candidate.headersTimeout = 10_000;
      candidate.requestTimeout = 10_000;
      candidate.once('error', reject);
      candidate.listen(port, '0.0.0.0', () => {
        candidate.off('error', reject);
        resolve(candidate);
      });
    });
  }

  const status = (): PortalStatus => {
    if (!server) return { running: false, port: null, urls: [] };
    const { port } = server.address() as AddressInfo;
    return { running: true, port, urls: addresses().map((ip) => `http://${ip}:${port}`) };
  };

  return {
    async start() {
      if (server) return status();
      try {
        server = await listen(preferredPort);
      } catch (error) {
        // The usual port is taken: any free one works, the address is shown on screen anyway.
        if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE' || preferredPort === 0) {
          throw error;
        }
        server = await listen(0);
      }
      return status();
    },
    async stop() {
      const current = server;
      server = null;
      if (current) {
        await new Promise<void>((resolve) => {
          current.close(() => resolve());
          current.closeAllConnections();
        });
      }
      return status();
    },
    status,
  };
}
