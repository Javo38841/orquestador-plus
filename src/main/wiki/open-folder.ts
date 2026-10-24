import fs from 'node:fs';

/**
 * Opens `wiki/` in the system file explorer (RF-08). `open` is `shell.openPath`, which resolves to
 * an empty string on success and an error message otherwise. The folder is created if missing.
 */
export async function openWikiFolder(
  dir: string,
  open: (target: string) => Promise<string>,
): Promise<boolean> {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return (await open(dir)) === '';
  } catch {
    return false;
  }
}
