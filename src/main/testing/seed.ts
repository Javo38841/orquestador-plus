import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { rebuildIndex, serializeNote } from '../wiki/wiki';

/**
 * Deterministic test-data generator (RNF-05). Same seed, same data. It lives outside the
 * production bundle: unit tests import it and `seed-cli.ts` exposes it for E2E and manual runs.
 */
export interface SeedVolume {
  tasks: number;
  notes: number;
  bugs: number;
  journal: number;
  inbox: number;
  snippets: number;
}

/** "Years of use": the volume RNF-05 must hold up against. */
export const YEARS_OF_USE: SeedVolume = {
  tasks: 5000,
  notes: 2000,
  bugs: 1000,
  journal: 3000,
  inbox: 500,
  snippets: 500,
};

export const DEFAULT_SEED = 20240601;

/** Multiplies every count, e.g. 10 for the manual "10x" check. */
export function scaleVolume(volume: SeedVolume, factor: number): SeedVolume {
  const scaled = { ...volume };
  for (const key of Object.keys(scaled) as (keyof SeedVolume)[]) {
    scaled[key] = Math.round(scaled[key] * factor);
  }
  return scaled;
}

/** mulberry32: small, fast and fully determined by its seed. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// "informe" and "reunión" are deliberately common so a search for them has many hits.
const WORDS = [
  'informe',
  'reunión',
  'cliente',
  'revisión',
  'despliegue',
  'migración',
  'error',
  'servidor',
  'base',
  'datos',
  'actualización',
  'diseño',
  'pruebas',
  'documentación',
  'integración',
  'módulo',
  'consulta',
  'índice',
  'rendimiento',
  'seguridad',
  'usuario',
  'reporte',
  'factura',
  'API',
  'login',
  'caché',
  'sesión',
  'configuración',
  'análisis',
  'optimización',
  'ventas',
  'equipo',
  'proyecto',
  'sprint',
  'entrega',
  'versión',
  'formulario',
  'pantalla',
  'correo',
];

const BASE_DATE = Date.UTC(2024, 5, 1);
const DAY_MS = 86_400_000;

export interface SeedSummary extends SeedVolume {
  projects: number;
}

/** Fills `db` (already migrated) and `<dataDir>/wiki` with the given volume, one transaction per kind. */
export function seedDatabase(
  db: Database.Database,
  dataDir: string,
  volume: SeedVolume = YEARS_OF_USE,
  seed = DEFAULT_SEED,
): SeedSummary {
  const random = createRandom(seed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
  const phrase = (min: number, max: number): string => {
    const count = min + Math.floor(random() * (max - min + 1));
    return Array.from({ length: count }, () => pick(WORDS)).join(' ');
  };
  const sentence = (): string => phrase(5, 12);
  // Seeded data spans the ~4 years before BASE_DATE; never reads the clock.
  const isoAgo = (maxDays: number): string =>
    new Date(BASE_DATE - Math.floor(random() * maxDays) * DAY_MS).toISOString();

  const projects = 20;
  db.transaction(() => {
    const insert = db.prepare('INSERT INTO projects (name, created_at) VALUES (?, ?)');
    for (let i = 0; i < projects; i++) insert.run(`Proyecto ${i + 1} ${pick(WORDS)}`, isoAgo(1400));

    const tag = db.prepare('INSERT INTO tags (name) VALUES (?)');
    for (let i = 0; i < 30; i++) tag.run(`etiqueta${i + 1}`);
  })();

  db.transaction(() => {
    const insert = db.prepare(
      'INSERT INTO tasks (title, status, due_date, project_id, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    const link = db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)');
    for (let i = 0; i < volume.tasks; i++) {
      const info = insert.run(
        sentence(),
        random() < 0.7 ? 'done' : 'todo',
        random() < 0.5 ? isoAgo(1400).slice(0, 10) : null,
        random() < 0.8 ? 1 + Math.floor(random() * projects) : null,
        isoAgo(1400),
      );
      link.run(Number(info.lastInsertRowid), 1 + Math.floor(random() * 30));
    }
  })();

  db.transaction(() => {
    const insert = db.prepare(
      `INSERT INTO bugs (title, symptom, impact, root_cause, solution, severity, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (let i = 0; i < volume.bugs; i++) {
      const created = isoAgo(1400);
      insert.run(
        sentence(),
        sentence(),
        sentence(),
        sentence(),
        sentence(),
        pick(['high', 'medium', 'low']),
        pick(['new', 'analysis', 'resolved', 'verified']),
        created,
        created,
      );
    }
  })();

  db.transaction(() => {
    const insert = db.prepare(
      'INSERT INTO journal_entries (date, text, created_at, updated_at) VALUES (?, ?, ?, ?)',
    );
    for (let i = 0; i < volume.journal; i++) {
      // One entry per day, going back from BASE_DATE (the date is the primary key).
      const date = new Date(BASE_DATE - i * DAY_MS).toISOString();
      insert.run(date.slice(0, 10), `${sentence()}. ${sentence()}.`, date, date);
    }
  })();

  db.transaction(() => {
    const insert = db.prepare(
      "INSERT INTO inbox_items (title, source, created_at) VALUES (?, 'quick_capture', ?)",
    );
    for (let i = 0; i < volume.inbox; i++) insert.run(sentence(), isoAgo(400));
  })();

  db.transaction(() => {
    const insert = db.prepare(
      'INSERT INTO snippets (title, type, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    );
    for (let i = 0; i < volume.snippets; i++) {
      const created = isoAgo(1400);
      const type = pick(['sql', 'command']);
      const content =
        type === 'sql' ? `SELECT * FROM ${pick(WORDS)} WHERE id = ${i};` : `git log --grep ${i}`;
      insert.run(sentence(), type, content, created, created);
    }
  })();

  // Notes are Markdown files (ADR-001): write them, then index them like the app does at start.
  const wikiDir = path.join(dataDir, 'wiki');
  fs.mkdirSync(wikiDir, { recursive: true });
  for (let i = 0; i < volume.notes; i++) {
    const title = `Nota ${i + 1} ${phrase(2, 4)}`;
    const created = isoAgo(1400);
    const body = `${sentence()}.\n\nVer [[Nota ${1 + Math.floor(random() * volume.notes)}]].\n\n${sentence()}.\n`;
    fs.writeFileSync(
      path.join(wikiDir, `nota-${i + 1}.md`),
      serializeNote(title, created, created, body),
    );
  }
  rebuildIndex({ db, dir: wikiDir });

  return { ...volume, projects };
}
