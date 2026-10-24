import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import { migrate, migrations } from '../db/migrations';
import { captureItem } from '../inbox/inbox';
import { createTask } from '../tasks/tasks';
import { createNote, deleteNote, rebuildIndex, updateNote, type Wiki } from '../wiki/wiki';
import { search } from './search';

describe('wiki notes in the global search', () => {
  let root: string;
  let db: Database.Database;
  let wiki: Wiki;

  const create = (title: string, content = '', section?: string) => {
    const r = createNote(wiki, { title, content, ...(section && { section }) });
    if (!r.ok) throw new Error(`create ${title}: ${r.error}`);
    return r.note;
  };
  const notes = (text: string) => search(db, text).filter((r) => r.kind === 'note');

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-notesearch-'));
    db = openDatabase(root);
    wiki = { db, dir: path.join(root, 'wiki') };
  });

  afterEach(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('CP-10-13: finds a note by title or content with kind, id, title, section and snippet', () => {
    create('Guía de despliegue', 'Primero se ejecuta el pipeline de producción.', 'Operaciones');
    create('Otra', 'Nada relacionado');

    const byContent = notes('pipeline');
    expect(byContent).toHaveLength(1);
    expect(byContent[0]).toMatchObject({
      kind: 'note',
      id: expect.any(Number),
      title: 'Guía de despliegue',
      slug: 'Guía de despliegue',
      section: 'Operaciones',
    });
    expect(byContent[0].snippet).toContain('pipeline');
    expect(notes('despliegue')).toHaveLength(1);
  });

  it('CP-10-14: ignores case and accents and matches a prefix', () => {
    create('Migración', 'x');
    create('Instalación', 'y');

    expect(notes('migracion').map((r) => r.title)).toEqual(['Migración']);
    expect(notes('instal').map((r) => r.title)).toEqual(['Instalación']);
  });

  it('CP-10-15: finds text that only appears inside a code block', () => {
    create('Comandos', 'Texto.\n\n```bash\nkubectl rollout restart\n```\n');

    expect(notes('rollout').map((r) => r.title)).toEqual(['Comandos']);
  });

  it('CP-10-16: create, edit, rename and delete are reflected at once', () => {
    create('Alfa', 'contenido zorro');
    expect(notes('zorro')).toHaveLength(1);

    updateNote(wiki, 'Alfa', { title: 'Alfa', content: 'contenido lobo' });
    expect(notes('zorro')).toEqual([]);
    expect(notes('lobo')).toHaveLength(1);

    updateNote(wiki, 'Alfa', { title: 'Beta', content: 'contenido lobo' });
    expect(notes('alfa')).toEqual([]);
    expect(notes('beta')).toMatchObject([{ title: 'Beta', slug: 'Beta' }]);

    deleteNote(wiki, 'Beta');
    expect(notes('lobo')).toEqual([]);
    expect(notes('beta')).toEqual([]);
  });

  it('CP-10-17: rebuildIndex makes files on disk searchable and leaves skipped ones out', () => {
    fs.mkdirSync(path.join(wiki.dir, 'Guías'), { recursive: true });
    fs.writeFileSync(
      path.join(wiki.dir, 'Guías', 'Redes.md'),
      '---\ntitle: "Redes"\n---\n\nConfigurar el firewall\n',
    );
    fs.writeFileSync(path.join(wiki.dir, 'Uno.md'), '---\ntitle: "Mismo"\n---\n\nprimero unico\n');
    fs.writeFileSync(
      path.join(wiki.dir, 'Dos.md'),
      '---\ntitle: "Mismo"\n---\n\nsegundo repetido\n',
    );

    rebuildIndex(wiki);
    expect(notes('firewall')).toMatchObject([{ title: 'Redes', section: 'Guías' }]);
    expect(notes('repetido')).toHaveLength(1);
    expect(notes('unico')).toEqual([]);

    fs.rmSync(path.join(wiki.dir, 'Guías', 'Redes.md'));
    rebuildIndex(wiki);
    expect(notes('firewall')).toEqual([]);
  });

  it.each(['', '   ', '"', '*', '-', 'AND', '(', ')', '"x', 'a AND (b', 'NEAR('])(
    'CP-10-18: %j does not throw',
    (text) => {
      create('Operadores', 'texto con AND, "comillas", (paréntesis), - guion y * asterisco');
      expect(() => search(db, text)).not.toThrow();
    },
  );

  it('CP-10-18: special characters in the text stay literal', () => {
    create('Operadores', 'texto con AND, "comillas" y (paréntesis)');
    expect(notes('"comillas" AND')).toHaveLength(1);
    expect(notes('"*-()')).toEqual([]);
  });

  it('CP-10-19: the migration indexes notes that existed before and keeps older migrations', () => {
    const old = new Database(':memory:');
    migrate(
      old,
      migrations.filter((m) => m.version < 17),
    );
    old
      .prepare(
        "INSERT INTO notes (slug, title, title_key, created_at, updated_at) VALUES ('Previa', 'Nota previa', 'nota previa', 'x', 'x')",
      )
      .run();

    migrate(old);

    expect(search(old, 'previa')).toMatchObject([{ kind: 'note', title: 'Nota previa' }]);
    expect(migrations.map((m) => m.version)).toEqual(migrations.map((_, i) => i + 1));
    expect(migrations.find((m) => m.version === 17)!.name).toBe('note_search');
    old.close();
  });

  it('CP-10-20: at most 50 results in all, tasks and inbox unchanged', () => {
    const t = createTask(db, { title: 'Informe de tarea' });
    if (!t.ok) throw new Error('task');
    captureItem(db, 'Informe de bandeja');
    expect(search(db, 'informe')).toEqual([
      { kind: 'task', id: t.task.id, title: 'Informe de tarea' },
      { kind: 'inbox', id: 1, title: 'Informe de bandeja' },
    ]);

    for (let i = 0; i < 60; i++) create(`Informe ${i}`, 'informe');
    const results = search(db, 'informe');
    expect(results).toHaveLength(50);
  });

  it('CP-10-20: a title match ranks above a mention in the text', () => {
    create('Otra cosa', 'se habla de kafka al pasar');
    create('Kafka', 'x');
    expect(notes('kafka')[0].title).toBe('Kafka');
  });

  it('CP-10-22: carries the id of the matching heading, none when no heading matches', () => {
    create(
      'Servidor',
      'Intro\n\n## Instalación\n\npasos\n\n## Configuración de red\n\nfirewall y puertos\n',
    );

    expect(notes('configuracion')[0].heading).toBe('configuración-de-red');
    expect(notes('puertos')[0].heading).toBeUndefined();
  });
});
