import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import { migrate, migrations } from '../db/migrations';
import { convertToTask, listInbox } from '../inbox/inbox';
import { createProject } from '../tasks/tasks';
import { search } from '../search/search';
import { createLink, listLinks, revokeLink } from './links';
import { createPortalServer, handlePortalRequest, type PortalRequest } from './server';

const NOW = new Date('2026-03-01T10:00:00.000Z');

describe('report portal', () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-portal-'));
    db = openDatabase(dir);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const newLink = (extra: Partial<{ expiresInHours: number; maxSubmissions: number }> = {}) => {
    const result = createLink(
      db,
      { projectId: null, expiresInHours: 24, maxSubmissions: 20, ...extra },
      NOW,
    );
    if (!result.ok) throw new Error('link not created');
    return result.link;
  };
  const post = (body: unknown, now = NOW) =>
    handlePortalRequest(
      db,
      {
        method: 'POST',
        path: '/reportar',
        contentType: 'application/json',
        body: JSON.stringify(body),
      },
      now,
    );
  const inboxCount = () =>
    (db.prepare('SELECT COUNT(*) AS n FROM inbox_items').get() as { n: number }).n;

  it('CP-15-01: a valid POST with a live token creates a "portal" inbox item with the reporter', () => {
    const link = newLink();
    const response = post({ token: link.token, name: ' Ana ', description: ' No carga el login ' });

    expect(response.status).toBe(201);
    expect(listInbox(db)).toEqual([
      {
        id: 1,
        title: 'No carga el login',
        source: 'portal',
        reporter: 'Ana',
        createdAt: NOW.toISOString(),
      },
    ]);
    expect(listLinks(db, NOW)[0]!.submissions).toBe(1);
  });

  it('CP-15-01: the HTML form posts urlencoded data and gets a page back', () => {
    const link = newLink();
    const response = handlePortalRequest(
      db,
      {
        method: 'POST',
        path: '/reportar',
        contentType: 'application/x-www-form-urlencoded',
        body: new URLSearchParams({
          token: link.token,
          name: 'Luis',
          description: 'Falla',
        }).toString(),
      },
      NOW,
    );
    expect(response.status).toBe(201);
    expect(response.headers['content-type']).toContain('text/html');
    expect(listInbox(db)[0]).toMatchObject({ reporter: 'Luis', title: 'Falla' });
  });

  it('CP-15-02: unknown, expired or revoked tokens are refused and create nothing', () => {
    const live = newLink();
    const revoked = newLink();
    revokeLink(db, revoked.id, NOW);
    const valid = { name: 'Ana', description: 'Algo' };

    expect(post({ ...valid, token: 'x'.repeat(32) }).status).toBe(401);
    expect(post({ ...valid }).status).toBe(401);
    expect(post({ ...valid, token: revoked.token }).status).toBe(403);
    const later = new Date(NOW.getTime() + 25 * 3_600_000);
    expect(post({ ...valid, token: live.token }, later).status).toBe(403);
    expect(inboxCount()).toBe(0);
  });

  it('CP-15-03: other methods and routes neither return nor change user data', () => {
    const link = newLink();
    post({ token: link.token, name: 'Ana', description: 'Secreto del usuario' });
    db.prepare(
      "INSERT INTO inbox_items (title, source, created_at) VALUES ('Mío', 'quick_capture', 'x')",
    ).run();
    const before = JSON.stringify(db.prepare('SELECT * FROM inbox_items').all());

    const attempts: PortalRequest[] = [];
    for (const method of ['GET', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
      attempts.push({ method, path: '/reportar', contentType: '', body: '' });
    }
    for (const path of ['/', '/api/inbox', '/tasks', '/reportar/1', '/r', `/r/${link.token}/x`]) {
      attempts.push({ method: 'GET', path, contentType: '', body: '' });
      attempts.push({
        method: 'POST',
        path,
        contentType: 'application/json',
        body: JSON.stringify({ token: link.token, name: 'a', description: 'b' }),
      });
    }
    for (const request of attempts) {
      const response = handlePortalRequest(db, request, NOW);
      expect([404, 405]).toContain(response.status);
      expect(response.body).toBe('');
    }
    expect(JSON.stringify(db.prepare('SELECT * FROM inbox_items').all())).toBe(before);
  });

  it('CP-15-03: the form page is static and holds no stored data', () => {
    const link = newLink();
    post({ token: link.token, name: 'Ana', description: 'Secreto del usuario' });
    const response = handlePortalRequest(
      db,
      { method: 'GET', path: `/r/${link.token}`, contentType: '', body: '' },
      NOW,
    );
    expect(response.status).toBe(200);
    expect(response.body).toContain('action="/reportar"');
    expect(response.body).not.toContain('Secreto');
    expect(response.body).not.toContain('Ana');
  });

  it('CP-15-04: empty, too long or oversized-name submissions get 400 and create nothing', () => {
    const { token } = newLink();
    const cases = [
      { name: 'Ana', description: '   ' },
      { name: 'Ana', description: 'x'.repeat(501) },
      { name: 'n'.repeat(81), description: 'ok' },
      { name: '', description: 'ok' },
    ];
    for (const body of cases) expect(post({ token, ...body }).status).toBe(400);
    expect(post({ token, name: 'Ana', description: 5 }).status).toBe(400);
    const malformed = handlePortalRequest(
      db,
      { method: 'POST', path: '/reportar', contentType: 'application/json', body: '{nope' },
      NOW,
    );
    expect(malformed.status).toBe(400);
    expect(inboxCount()).toBe(0);
    expect(listLinks(db, NOW)[0]!.submissions).toBe(0);
  });

  it('CP-15-05: a link over its submission limit answers 429 and creates nothing', () => {
    const { token } = newLink({ maxSubmissions: 2 });
    const body = { token, name: 'Ana', description: 'Falla' };
    expect(post(body).status).toBe(201);
    expect(post(body).status).toBe(201);
    expect(post(body).status).toBe(429);
    expect(inboxCount()).toBe(2);
    expect(listLinks(db, NOW)[0]!.status).toBe('exhausted');
  });

  it('CP-15-06: revoking a link updates its status and it stops accepting reports', () => {
    const project = createProject(db, 'Web');
    if (!project.ok) throw new Error('project');
    const created = createLink(
      db,
      { projectId: project.project.id, expiresInHours: 2, maxSubmissions: 5 },
      NOW,
    );
    if (!created.ok) throw new Error('link');
    expect(created.link).toMatchObject({
      projectName: 'Web',
      status: 'active',
      expiresAt: '2026-03-01T12:00:00.000Z',
    });
    expect(listLinks(db, NOW)).toHaveLength(1);

    expect(revokeLink(db, created.link.id, NOW)).toBe(true);
    expect(revokeLink(db, 999, NOW)).toBe(false);
    expect(listLinks(db, NOW)[0]!.status).toBe('revoked');
    expect(post({ token: created.link.token, name: 'Ana', description: 'Falla' }).status).toBe(403);
  });

  it('CP-15-06: link input is validated and the tokens are unguessable and distinct', () => {
    expect(createLink(db, { projectId: 99, expiresInHours: 1, maxSubmissions: 1 })).toEqual({
      ok: false,
      error: 'invalid_project',
    });
    expect(createLink(db, { projectId: null, expiresInHours: 0, maxSubmissions: 1 })).toEqual({
      ok: false,
      error: 'invalid_expiry',
    });
    expect(createLink(db, { projectId: null, expiresInHours: 1, maxSubmissions: 501 })).toEqual({
      ok: false,
      error: 'invalid_limit',
    });
    expect(createLink(db, null)).toMatchObject({ ok: false });
    const [a, b] = [newLink(), newLink()];
    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('CP-15-07: nothing listens while the portal is off; turning it on exposes its address', async () => {
    const server = createPortalServer({
      db,
      port: 0,
      now: () => NOW,
      addresses: () => ['192.168.1.20'],
    });
    expect(server.status()).toEqual({ running: false, port: null, urls: [] });

    const on = await server.start();
    try {
      expect(on.running).toBe(true);
      expect(on.urls).toEqual([`http://192.168.1.20:${on.port}`]);
      const link = newLink();
      const status = await request(on.port!, 'POST', '/reportar', {
        token: link.token,
        name: 'Ana',
        description: 'Falla',
      });
      expect(status).toBe(201);
      expect(inboxCount()).toBe(1);
      expect(await request(on.port!, 'GET', '/reportar')).toBe(405);
    } finally {
      await server.stop();
    }
    expect(server.status().running).toBe(false);
    await expect(request(on.port!, 'GET', '/')).rejects.toThrow();
  });

  it('CP-15-07: a body over the limit is rejected before it is read', async () => {
    const server = createPortalServer({ db, port: 0, now: () => NOW });
    const { port } = await server.start();
    try {
      const link = newLink();
      const status = await request(port!, 'POST', '/reportar', {
        token: link.token,
        name: 'Ana',
        description: 'x'.repeat(20_000),
      });
      expect(status).toBe(413);
      expect(inboxCount()).toBe(0);
    } finally {
      await server.stop();
    }
  });

  it('CP-15-08: a portal item is searchable and can be classified like any other', () => {
    const { token } = newLink();
    post({ token, name: 'Ana', description: 'Pantalla blanca al entrar' });
    expect(search(db, 'blanca')).toHaveLength(1);

    const result = convertToTask(db, 1, { title: 'Pantalla blanca' }, NOW);
    expect(result.ok).toBe(true);
    expect(listInbox(db)).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM portal_reports').get()).toEqual({ n: 0 });
  });

  it('CP-15-09: the migration keeps earlier items as "Captura rápida" and creates the link tables', () => {
    const old = new Database(':memory:');
    old.pragma('foreign_keys = ON');
    migrate(
      old,
      migrations.filter((m) => m.version <= 14),
    );
    old
      .prepare(
        "INSERT INTO inbox_items (title, source, created_at) VALUES ('Vieja', 'quick_capture', 'a')",
      )
      .run();
    old
      .prepare(
        "INSERT INTO inbox_items (title, source, created_at) VALUES ('Otra', 'quick_capture', 'b')",
      )
      .run();
    old.prepare('DELETE FROM inbox_items WHERE id = 2').run();

    expect(migrate(old)).toBe(migrations.at(-1)!.version);
    expect(old.prepare('SELECT id, title, source FROM inbox_items').all()).toEqual([
      { id: 1, title: 'Vieja', source: 'quick_capture' },
    ]);
    const tables = old
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'portal_%' ORDER BY name",
      )
      .all();
    expect(tables).toEqual([{ name: 'portal_links' }, { name: 'portal_reports' }]);
    // The id counter survives the rebuild and the search triggers still work.
    const info = old
      .prepare(
        "INSERT INTO inbox_items (title, source, created_at) VALUES ('Nueva', 'portal', 'c')",
      )
      .run();
    expect(Number(info.lastInsertRowid)).toBe(3);
    expect(
      old.prepare("SELECT COUNT(*) AS n FROM search_index WHERE kind = 'inbox'").get(),
    ).toEqual({ n: 2 });
    expect(() =>
      old
        .prepare("INSERT INTO inbox_items (title, source, created_at) VALUES ('x', 'otro', 'c')")
        .run(),
    ).toThrow();
    old.close();
  });
});

function request(port: number, method: string, urlPath: string, body?: object): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path: urlPath,
        headers: { 'content-type': 'application/json' },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
