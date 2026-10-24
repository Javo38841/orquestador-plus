import fs from 'node:fs';
import path from 'node:path';
import {
  ATTACHMENT_MAX_BYTES,
  attachmentLink,
  imageType,
  isRunnableName,
  localTarget,
  sanitizeAttachmentName,
  uniqueAttachmentName,
  type AttachmentError,
  type AttachmentImageResult,
  type AttachmentResult,
} from '../../shared/attachments';
import { slugBaseName } from '../../shared/wiki';
import { assetsDirOf, isInsideWiki, locateNote, type Wiki } from './wiki';

const fail = (error: AttachmentError): { ok: false; error: AttachmentError } => ({
  ok: false,
  error,
});

/** The assets folder of a note, created if needed. Null if it is a symbolic link or leaves `wiki/`. */
function ensureAssetsDir(wiki: Wiki, noteFile: string): { dir: string; created: boolean } | null {
  const dir = assetsDirOf(noteFile);
  let created = false;
  try {
    const stat = fs.lstatSync(dir);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return null;
  } catch {
    fs.mkdirSync(dir);
    created = true;
  }
  if (!isInsideWiki(wiki, dir)) {
    if (created) fs.rmSync(dir, { recursive: true, force: true });
    return null;
  }
  return { dir, created };
}

/**
 * Copies a file next to a note: `wiki/<section>/<note>.assets/<name>`. The name is sanitized so it can
 * only ever be one entry of that folder, and a name already taken gets `-1`, `-2`… so nothing is
 * overwritten. Nothing is written for a bad payload, an empty or oversized file, a note that is gone
 * or a symbolic link. Returns the Markdown link to insert in the note.
 */
export function attachFile(wiki: Wiki, input: unknown): AttachmentResult {
  if (typeof input !== 'object' || input === null) return fail('invalid');
  const { slug, name, data } = input as Record<string, unknown>;
  if (typeof slug !== 'string' || typeof name !== 'string' || !(data instanceof Uint8Array)) {
    return fail('invalid');
  }
  if (data.byteLength === 0) return fail('empty');
  if (data.byteLength > ATTACHMENT_MAX_BYTES) return fail('too_large');
  const note = locateNote(wiki, slug);
  if (typeof note === 'string') return fail(note);

  let made: { dir: string; created: boolean } | null = null;
  try {
    made = ensureAssetsDir(wiki, note.file);
    if (!made) return fail('invalid');
    const wanted = sanitizeAttachmentName(name);
    // `wx` fails rather than overwrite if the name appears between listing and writing.
    for (let attempt = 0; attempt < 5; attempt++) {
      const stored = uniqueAttachmentName(wanted, new Set(fs.readdirSync(made.dir)));
      try {
        fs.writeFileSync(path.join(made.dir, stored), data, { flag: 'wx' });
        return { ok: true, link: attachmentLink(slugBaseName(slug), stored), name: stored };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    return fail('io');
  } catch {
    if (made?.created) fs.rmSync(made.dir, { recursive: true, force: true });
    return fail('io');
  }
}

/** The file a link of the note points at, if it is a regular file inside `wiki/`. */
function resolveLinked(
  wiki: Wiki,
  slug: unknown,
  src: unknown,
): { ok: true; file: string } | { ok: false; error: AttachmentError } {
  if (typeof src !== 'string') return fail('invalid');
  const relative = localTarget(src);
  if (relative === null) return fail('invalid');
  const note = locateNote(wiki, slug);
  if (typeof note === 'string') return fail(note);
  const folder = path.dirname(note.file);
  const file = path.resolve(folder, ...relative.split('/'));
  if (!file.startsWith(folder + path.sep)) return fail('invalid');
  try {
    fs.lstatSync(file);
  } catch {
    return fail('not_found');
  }
  // Symbolic links are followed only while they stay inside `wiki/`.
  if (!isInsideWiki(wiki, file)) return fail('invalid');
  try {
    if (!fs.statSync(file).isFile()) return fail('not_found');
  } catch {
    return fail('not_found');
  }
  return { ok: true, file };
}

/** An image linked from a note, as a `data:` URL. Anything that is not a picture is refused. */
export function readAttachment(wiki: Wiki, slug: unknown, src: unknown): AttachmentImageResult {
  const found = resolveLinked(wiki, slug, src);
  if (!found.ok) return found;
  const type = imageType(found.file);
  if (type === null) return fail('invalid');
  try {
    if (fs.statSync(found.file).size > ATTACHMENT_MAX_BYTES) return fail('too_large');
    const base64 = fs.readFileSync(found.file).toString('base64');
    return { ok: true, dataUrl: `data:${type};base64,${base64}` };
  } catch {
    return fail('io');
  }
}

/**
 * Opens a linked file with the system app, only if it is inside `wiki/`. Programs and scripts are never
 * opened: this is for documents. `open` resolves to an error message, empty on success (`shell.openPath`).
 */
export async function openAttachment(
  wiki: Wiki,
  slug: unknown,
  src: unknown,
  open: (file: string) => Promise<string>,
): Promise<boolean> {
  const found = resolveLinked(wiki, slug, src);
  if (!found.ok || isRunnableName(found.file)) return false;
  try {
    return (await open(found.file)) === '';
  } catch {
    return false;
  }
}
