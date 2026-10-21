// Bundles the Electron main process and preload with esbuild.
// ORQ_CHANNEL=prod builds production; anything else builds the Dev channel, so an
// accidental build never touches production data.
import { build, context } from 'esbuild';

const channel = process.env.ORQ_CHANNEL === 'prod' ? 'prod' : 'dev';
const watch = process.argv.includes('--watch');

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: channel === 'dev',
  external: ['electron', 'better-sqlite3'],
  define: { __CHANNEL__: JSON.stringify(channel) },
  logLevel: 'info',
};

const targets = [
  { ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.js' },
  { ...common, entryPoints: ['src/preload/preload.ts'], outfile: 'dist/preload/preload.js' },
];

if (watch) {
  for (const options of targets) await (await context(options)).watch();
} else {
  await Promise.all(targets.map((options) => build(options)));
  console.log(`electron bundles built (channel: ${channel})`);
}
