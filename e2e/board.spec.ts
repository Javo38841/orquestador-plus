import http from 'node:http';
import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './launch';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await launched.close();
});

async function addTask(page: LaunchedApp['page'], title: string, project?: string) {
  await page.getByTestId('new-task').click();
  await page.getByTestId('task-title').fill(title);
  if (project) {
    await page.getByTestId('task-project').selectOption('new');
    await page.getByTestId('task-new-project').fill(project);
  }
  await page.getByTestId('task-save').click();
  await expect(page.getByTestId('task-row').filter({ hasText: title })).toBeVisible();
}

const column = (page: LaunchedApp['page'], status: string) =>
  page.locator(`[data-testid="board-column"][data-status="${status}"]`);

const pickBoard = async (page: LaunchedApp['page'], value: string) => {
  await page.getByTestId('board-select').click();
  await page.locator(`[data-testid="board-select-option"][data-value="${value}"]`).click();
};

async function moveCard(page: LaunchedApp['page'], title: string, target: string) {
  const card = page.getByTestId('board-card').filter({ hasText: title });
  await card.getByTestId('board-move').click();
  await card.locator(`[data-testid="board-move-option"][data-status="${target}"]`).click();
}

test('CP-04-01: Tablero shows the three columns with counts and each task in its column', async () => {
  const { page } = launched;
  await page.getByRole('link', { name: 'Tareas' }).click();
  await addTask(page, 'Suelta pendiente');
  await addTask(page, 'Con proyecto', 'api-gateway');
  await addTask(page, 'Ya terminada');
  await page
    .getByTestId('task-row')
    .filter({ hasText: 'Ya terminada' })
    .getByTestId('task-check')
    .check();

  await page.getByRole('link', { name: 'Tablero' }).click();
  await moveCard(page, 'Con proyecto', 'in_progress');

  await expect(column(page, 'todo').getByTestId('board-count')).toHaveText('1');
  await expect(column(page, 'in_progress').getByTestId('board-count')).toHaveText('1');
  await expect(column(page, 'done').getByTestId('board-count')).toHaveText('1');
  await expect(column(page, 'todo')).toContainText('Suelta pendiente');
  await expect(column(page, 'todo')).toContainText('Suelta');
  await expect(column(page, 'in_progress')).toContainText('Con proyecto');
  await expect(column(page, 'in_progress')).toContainText('api-gateway');
  await expect(column(page, 'done')).toContainText('Ya terminada');
});

test('CP-04-02: a card moved to "En curso" is still there after reopening the app', async () => {
  const { page, app, dataDir } = launched;
  await page.getByRole('link', { name: 'Tareas' }).click();
  await addTask(page, 'Persistir columna');
  await page.getByRole('link', { name: 'Tablero' }).click();
  await moveCard(page, 'Persistir columna', 'in_progress');
  await expect(column(page, 'in_progress')).toContainText('Persistir columna');

  await app.close();
  const reopened = await launchApp(dataDir);
  launched = reopened;
  await reopened.page.getByRole('link', { name: 'Tablero' }).click();
  await expect(column(reopened.page, 'in_progress')).toContainText('Persistir columna');
  await expect(column(reopened.page, 'todo')).not.toContainText('Persistir columna');
});

test('CP-04-05: Tablero shows a "Proyectos" section with every existing project', async () => {
  const { page } = launched;
  await page.getByRole('link', { name: 'Tareas' }).click();
  await addTask(page, 'Una', 'alfa');
  await addTask(page, 'Otra', 'beta');
  await page.getByRole('link', { name: 'Tablero' }).click();
  const panel = page.getByTestId('board-projects-panel');
  await expect(panel.getByRole('heading', { name: 'Proyectos' })).toBeVisible();
  await expect(panel.getByTestId('board-project-item')).toHaveText(['alfa', 'beta']);
});

test('CP-04-06: a project created from the board is in the list and combo box after reopening', async () => {
  const { page, app, dataDir } = launched;
  await page.getByRole('link', { name: 'Tablero' }).click();
  await page.getByTestId('project-name').fill('sin-tareas');
  await page.getByTestId('project-name').press('Enter');
  await expect(page.getByTestId('board-project-item')).toHaveText(['sin-tareas']);
  await page.getByTestId('board-select').click();
  await expect(page.getByTestId('board-select-option')).toHaveText([
    'General',
    'Sueltas',
    'sin-tareas',
  ]);

  await app.close();
  const reopened = await launchApp(dataDir);
  launched = reopened;
  await reopened.page.getByRole('link', { name: 'Tablero' }).click();
  await expect(reopened.page.getByTestId('board-project-item')).toHaveText(['sin-tareas']);
  await expect(reopened.page.getByTestId('board-select')).toHaveAttribute('data-value', /\d+/);
});

test('CP-05-10: "Sueltas" shows only tasks without a project and is remembered after reopening', async () => {
  const { page, app, dataDir } = launched;
  await page.getByRole('link', { name: 'Tareas' }).click();
  await addTask(page, 'Tarea suelta');
  await addTask(page, 'Tarea con proyecto', 'api-gateway');
  await page.getByRole('link', { name: 'Tablero' }).click();
  await pickBoard(page, 'loose');
  await expect(page.getByTestId('board-card')).toHaveCount(1);
  await expect(page.getByTestId('board-card').first()).toContainText('Tarea suelta');

  await app.close();
  const reopened = await launchApp(dataDir);
  launched = reopened;
  await reopened.page.getByRole('link', { name: 'Tablero' }).click();
  await expect(reopened.page.getByTestId('board-select')).toHaveAttribute('data-value', 'loose');
  await expect(reopened.page.getByTestId('board-card')).toHaveCount(1);
  await expect(reopened.page.getByTestId('board-card').first()).toContainText('Tarea suelta');
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

test('CP-05-28: Tablero shows the four colored columns, the report in Entrantes, and works by keyboard', async () => {
  const { page } = launched;
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  await page.getByRole('link', { name: 'Tareas' }).click();
  await page.getByTestId('new-task').click();
  await page.getByTestId('task-title').fill('Vencida ayer');
  await page.getByTestId('task-due').fill(yesterday);
  await page.getByTestId('task-save').click();
  await expect(page.getByTestId('task-row').filter({ hasText: 'Vencida ayer' })).toBeVisible();
  await addTask(page, 'Con proyecto', 'api-gateway');

  await page.getByRole('link', { name: 'Portal de reportes' }).click();
  await page.getByTestId('portal-toggle').click();
  await expect(page.getByTestId('portal-state')).toHaveText('Portal encendido');
  await page.getByTestId('link-create').click();
  await expect(page.getByTestId('portal-link')).toHaveCount(1);
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
    return { token: link!.token, port: (await api.getPortalStatus()).port };
  });
  expect(await postReport(port, token)).toBe(201);

  await page.getByRole('link', { name: 'Tablero' }).click();
  const titles = page.getByTestId('board-column-title');
  await expect(titles).toHaveText([/Entrantes · 1/, /Por hacer · 2/, /En curso · 0/, /Hecho · 0/]);
  await expect(column(page, 'inbox')).toContainText('El login no responde');
  await expect(column(page, 'inbox')).toContainText('Sin revisar');
  await expect(
    column(page, 'todo').getByTestId('board-card').filter({ hasText: 'Vencida ayer' }),
  ).toContainText('Venció ayer');

  // Classify the report as a task with the keyboard.
  await column(page, 'inbox').getByTestId('inbox-classify-task').focus();
  await page.keyboard.press('Enter');
  await expect(column(page, 'inbox').getByTestId('inbox-card')).toHaveCount(0);
  await expect(column(page, 'todo')).toContainText('El login no responde');

  // Move a card to "En curso" with the keyboard: Enter, arrows, Enter.
  const card = column(page, 'todo').getByTestId('board-card').filter({ hasText: 'Con proyecto' });
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(card.getByRole('menuitem', { name: 'En curso' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(column(page, 'in_progress')).toContainText('Con proyecto');
});
