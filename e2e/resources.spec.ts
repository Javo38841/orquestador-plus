import { expect, test, type Page } from '@playwright/test';
import type { OrquestadorApi } from '../src/shared/ipc';
import type { ElectronApplication } from '@playwright/test';
import { launchApp, type LaunchedApp } from './launch';

type AppWindow = Window & { orquestador: OrquestadorApi };

/** RNF-10 thresholds, measured on Linux (proposal to be validated by the owner). */
const IDLE_CPU_PERCENT = 2;
const ACTIVE_CPU_PERCENT = 5;
const MEASURE_MS = 30_000;
const SAMPLE_MS = 1000;
const NAVIGATION_ROUNDS = 50;
const MEMORY_GROWTH_MB = 50;

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await launched.close();
});

/** Average of the summed CPU usage of every process over `MEASURE_MS`, sampled each second. */
async function averageCpu(app: ElectronApplication): Promise<number> {
  const sample = () =>
    app.evaluate(({ app: electronApp }) =>
      electronApp.getAppMetrics().reduce((sum, p) => sum + p.cpu.percentCPUUsage, 0),
    );
  await sample(); // percentCPUUsage covers the time since the previous call
  const samples: number[] = [];
  for (let elapsed = 0; elapsed < MEASURE_MS; elapsed += SAMPLE_MS) {
    await new Promise((resolve) => setTimeout(resolve, SAMPLE_MS));
    samples.push(await sample());
  }
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}

/**
 * Total working set of every process, in MB, after a garbage collection so that only
 * retained memory counts (V8 collects lazily, which would show as growth).
 */
async function workingSetMb(app: ElectronApplication, page: Page): Promise<number> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('HeapProfiler.collectGarbage');
  } finally {
    await session.detach();
  }
  return app.evaluate(
    ({ app: electronApp }) =>
      electronApp.getAppMetrics().reduce((sum, p) => sum + p.memory.workingSetSize, 0) / 1024,
  );
}

async function visitAllScreens(page: Page, paths: string[]): Promise<void> {
  for (const path of paths) {
    // A click during the previous screen's first render can be dropped, so retry it.
    await expect(async () => {
      await page.locator(`nav a[href="/${path}"]`).click();
      await expect(page).toHaveURL(new RegExp(`/${path}$`), { timeout: 2000 });
    }).toPass({ timeout: 15_000 });
  }
}

test('CP-N10-01: a freshly opened app without activity uses under 2 % CPU on average', async () => {
  await expect(launched.page.getByRole('heading', { level: 1, name: 'Hoy' })).toBeVisible();
  const average = await averageCpu(launched.app);
  expect(average).toBeLessThan(IDLE_CPU_PERCENT);
});

test('CP-N10-02: with a reminder scheduled and the focus timer running CPU stays under 5 %', async () => {
  const { page, app } = launched;
  const created = await page.evaluate(async () => {
    const at = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const reminderAt = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(
      at.getHours(),
    )}:${pad(at.getMinutes())}`;
    return (window as unknown as AppWindow).orquestador.createTask({
      title: 'Revisar PR',
      dueDate: null,
      projectId: null,
      reminderAt,
    });
  });
  expect(created.ok).toBe(true);

  await page.getByRole('link', { name: 'Tareas' }).click();
  await page
    .getByTestId('task-row')
    .filter({ hasText: 'Revisar PR' })
    .getByTestId('task-today')
    .click();
  await page.getByRole('link', { name: 'Hoy' }).click();
  await page.getByTestId('focus-task').selectOption({ label: 'Revisar PR' });
  await page.getByTestId('focus-start').click();
  await expect(page.getByTestId('focus-state')).toHaveText('En curso');

  const average = await averageCpu(app);
  expect(average).toBeLessThan(ACTIVE_CPU_PERCENT);
});

test('CP-N10-07: navigating 50 times through every screen grows memory by under 50 MB', async () => {
  test.setTimeout(240_000);
  const { page, app } = launched;
  await expect(page.getByRole('heading', { level: 1, name: 'Hoy' })).toBeVisible();
  const paths = await page
    .locator('nav a[href]')
    .evaluateAll((links) =>
      links.map((a) => (a.getAttribute('href') ?? '').split('/').pop() ?? '').filter(Boolean),
    );
  expect(paths.length).toBeGreaterThan(5);

  await visitAllScreens(page, paths);
  await page.locator(`a[href$="/${paths[0]}"]`).first().click();
  const baseline = await workingSetMb(app, page);

  for (let round = 1; round < NAVIGATION_ROUNDS; round++) {
    await visitAllScreens(page, paths);
  }
  await page.locator(`a[href$="/${paths[0]}"]`).first().click();
  await page.waitForURL(new RegExp(`/${paths[0]}$`));

  const growth = (await workingSetMb(app, page)) - baseline;
  expect(growth).toBeLessThan(MEMORY_GROWTH_MB);
});
