import http from 'node:http';
import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './launch';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
  await launched.page.getByRole('link', { name: 'Portal de reportes' }).click();
});

test.afterEach(async () => {
  await launched.close();
});

function postReport(port: number, token: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: '/reportar',
        headers: { 'content-type': 'application/json' },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify({ token, name: 'Ana Pérez', description: 'El login no responde' }));
  });
}

test('CP-15-10: a report sent over HTTP to a link appears in the Bandeja as "Portal"', async () => {
  const { page } = launched;
  await expect(page.getByTestId('portal-state')).toHaveText('Portal apagado');
  await page.getByTestId('portal-toggle').click();
  await expect(page.getByTestId('portal-state')).toHaveText('Portal encendido');

  await page.getByTestId('link-create').click();
  const row = page.getByTestId('portal-link');
  await expect(row).toHaveCount(1);

  // Read the token through the same IPC the screen uses, then post like an outside visitor.
  const { token, port } = await page.evaluate(async () => {
    const api = (
      window as unknown as {
        orquestador: {
          listPortalLinks(): Promise<{ token: string }[]>;
          getPortalStatus(): Promise<{ port: number }>;
        };
      }
    ).orquestador;
    const [link] = await api.listPortalLinks();
    const status = await api.getPortalStatus();
    return { token: link!.token, port: status.port };
  });
  expect(await postReport(port, token)).toBe(201);

  await page.getByRole('link', { name: 'Bandeja de entrada' }).click();
  const item = page.getByTestId('inbox-item').filter({ hasText: 'El login no responde' });
  await expect(item).toBeVisible();
  await expect(item).toContainText('Portal');
  await expect(item).toContainText('Ana Pérez');
});
