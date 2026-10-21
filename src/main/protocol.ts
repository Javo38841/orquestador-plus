import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';

export const APP_SCHEME = 'app';
export const APP_ORIGIN = `${APP_SCHEME}://bundle`;

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Must run before the `ready` event. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/**
 * Maps a request path to a file inside `root`. Paths that escape `root` return
 * null; unknown paths fall back to `index.html` so Angular's router can handle
 * deep links and reloads.
 */
export function resolveRendererFile(
  root: string,
  requestPath: string,
  isFile: (file: string) => boolean,
): string | null {
  const base = path.resolve(root);
  const target = path.resolve(
    base,
    '.' + path.posix.normalize('/' + decodeURIComponent(requestPath)),
  );
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  return isFile(target) ? target : path.join(base, 'index.html');
}

/** Serves the built renderer from `root` through `app://` with a strict CSP. */
export function serveRenderer(root: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const file = resolveRendererFile(root, new URL(request.url).pathname, (f) => {
      try {
        return fs.statSync(f).isFile();
      } catch {
        return false;
      }
    });
    if (!file) return new Response('Not found', { status: 404 });

    const response = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    return new Response(response.body, { status: response.status, headers });
  });
}
