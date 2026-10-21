import { expect, test } from '@playwright/test';
import type { OrquestadorApi } from '../src/shared/ipc';
import { launchApp, type LaunchedApp } from './launch';

type AppWindow = Window & { orquestador: OrquestadorApi };

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await launched.close();
});

test('CP-18-09: a reminder in the near future fires a notification and marks the task as notified', async () => {
  const { app, page } = launched;
  // Observe the native notification in the main process without showing it.
  await app.evaluate(({ Notification }) => {
    const seen: { title: string; body: string }[] = [];
    (globalThis as Record<string, unknown>)['__notifications'] = seen;
    Notification.prototype.show = function (this: Electron.Notification) {
      seen.push({ title: this.title, body: this.body });
    };
  });

  const created = await page.evaluate(async () => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const at = new Date(Date.now() + 3000);
    const reminderAt = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(
      at.getHours(),
    )}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
    return (window as unknown as AppWindow).orquestador.createTask({
      title: 'Desplegar hotfix',
      dueDate: null,
      projectId: null,
      reminderAt,
    });
  });
  expect(created.ok).toBe(true);

  await expect
    .poll(
      () =>
        app.evaluate(
          () => ((globalThis as Record<string, unknown>)['__notifications'] as unknown[]).length,
        ),
      { timeout: 15_000 },
    )
    .toBe(1);
  const [shown] = await app.evaluate(
    () => (globalThis as Record<string, unknown>)['__notifications'] as { title: string }[],
  );
  expect(shown!.title).toBe('Desplegar hotfix');

  const notified = await page.evaluate(async () => {
    const [task] = await (window as unknown as AppWindow).orquestador.listTasks();
    return task!.reminderNotifiedAt;
  });
  expect(notified).not.toBeNull();
});
