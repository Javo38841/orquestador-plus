// Seeds a data folder with test volume. Run inside Electron's Node (native ABI):
//   ELECTRON_RUN_AS_NODE=1 electron dist/seed/seed.js <dataDir> [scale]
// Never point it at the real data folder.
import { openDatabase } from '../db/database';
import { seedDatabase, scaleVolume, YEARS_OF_USE } from './seed';

const [dataDir, scaleArg] = process.argv.slice(2);
if (!dataDir) {
  console.error('Usage: seed.js <dataDir> [scale]');
  process.exit(1);
}
const scale = scaleArg ? Number(scaleArg) : 1;
if (!Number.isFinite(scale) || scale <= 0) {
  console.error('scale must be a positive number');
  process.exit(1);
}

const db = openDatabase(dataDir);
const summary = seedDatabase(db, dataDir, scaleVolume(YEARS_OF_USE, scale));
db.close();
console.log(JSON.stringify(summary));
