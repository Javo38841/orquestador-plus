// Unit tests for the main process. They run inside Electron's Node
// (ELECTRON_RUN_AS_NODE) so native modules use the same ABI as the app.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/main/**/*.spec.ts', 'src/shared/**/*.spec.ts'],
    environment: 'node',
  },
});
