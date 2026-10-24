/** Images and files attached to a wiki note (RF-08). They live next to the note, in `<note>.assets/`. */

/** Largest file that can be attached. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** A note `x.md` keeps its attachments in the folder `x.assets`, beside it. */
export const ASSETS_SUFFIX = '.assets';

export type AttachmentError = 'invalid' | 'empty' | 'too_large' | 'not_found' | 'io';

export interface AttachmentInput {
  /** The note the file is attached to. */
  slug: string;
  /** Original file name; main sanitizes it. */
  name: string;
  data: Uint8Array;
}

export type AttachmentResult =
  | {
      ok: true;
      /** Markdown to insert in the note: `![alt](x.assets/a.png)` or `[a.pdf](x.assets/a.pdf)`. */
      link: string;
      /** Name the file was stored with. */
      name: string;
    }
  | { ok: false; error: AttachmentError };

/** An image of a note, ready to show: a `data:` URL, so the page loads nothing from the network. */
export type AttachmentImageResult =
  { ok: true; dataUrl: string } | { ok: false; error: AttachmentError };

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** MIME type of an image file name, or null if it is not an image. */
export function imageType(name: string): string | null {
  return IMAGE_TYPES[extensionOf(name)] ?? null;
}

export function isImageName(name: string): boolean {
  return imageType(name) !== null;
}

/** Files the system would run rather than open: never opened from a note. */
const RUNNABLE = new Set([
  'exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'ps1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'lnk',
  'jar', 'sh', 'bash', 'run', 'appimage', 'desktop', 'app', 'command', 'reg', 'hta',
]); // prettier-ignore

export function isRunnableName(name: string): boolean {
  return RUNNABLE.has(extensionOf(name));
}

const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_NAME_CODE_POINTS = 100;

/**
 * A file name that is safe as one entry of the assets folder: no separators, no `..`, no characters
 * Windows rejects, no spaces (they would break the Markdown link). Never empty.
 */
export function sanitizeAttachmentName(name: unknown): string {
  const text = typeof name === 'string' ? name : '';
  const base = text.split(/[\\/]/).pop() ?? '';
  let clean = base
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f:*?"<>|[\]()#%]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+/, '')
    .replace(/[.-]+$/, '');
  const dot = clean.lastIndexOf('.');
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : '';
  const room = Math.max(1, MAX_NAME_CODE_POINTS - Array.from(ext).length);
  clean =
    Array.from(stem)
      .slice(0, room)
      .join('')
      .replace(/[.-]+$/, '') + ext.slice(0, 20);
  if (clean === '') return 'adjunto';
  if (RESERVED_NAMES.test(stem)) return `_${clean}`;
  return clean;
}

/** `captura.png` taken → `captura-1.png`, `captura-2.png`… `taken` compares ignoring case. */
export function uniqueAttachmentName(name: string, taken: ReadonlySet<string>): string {
  const lower = new Set([...taken].map((n) => n.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 1; ; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}

/** Escapes what would end a Markdown link target early. */
function encodeTarget(text: string): string {
  return text.replace(
    /[%\s()#?[\]<>]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'),
  );
}

/** Markdown link path of a stored file: `<slug>.assets/<name>`, relative to the note. */
export function attachmentPath(slug: string, storedName: string): string {
  return `${encodeTarget(slug + ASSETS_SUFFIX)}/${encodeTarget(storedName)}`;
}

/** The Markdown link for a stored file: an image for pictures, a plain link for anything else. */
export function attachmentLink(slug: string, storedName: string): string {
  const target = attachmentPath(slug, storedName);
  const dot = storedName.lastIndexOf('.');
  const label = (dot > 0 ? storedName.slice(0, dot) : storedName).replace(/[[\]]/g, '');
  return isImageName(storedName) ? `![${label}](${target})` : `[${storedName}](${target})`;
}

/**
 * The path a link target points at, relative to the note's folder, with `/` separators; or null if the
 * target is not a plain relative path inside `wiki/`: URLs (`http:`, `file:`, `data:`…), absolute paths,
 * drive letters, and anything with `..`. Percent escapes are decoded first.
 */
export function localTarget(src: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(src.trim());
  } catch {
    return null;
  }
  // eslint-disable-next-line no-control-regex
  if (decoded === '' || /[\u0000-\u001f]/.test(decoded)) return null;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(decoded)) return null; // scheme or drive letter
  if (decoded.startsWith('/') || decoded.startsWith('\\') || decoded.startsWith('//')) return null;
  const parts = decoded.split(/[\\/]/);
  if (parts.some((p) => p === '' || p === '.' || p === '..')) return null;
  return parts.join('/');
}

/** `x.assets/a.png` links in `content` pointing at the folder of `from` now point at the one of `to`. */
export function rewriteAssetLinks(content: string, from: string, to: string): string {
  const oldPrefix = encodeTarget(from + ASSETS_SUFFIX) + '/';
  const newPrefix = encodeTarget(to + ASSETS_SUFFIX) + '/';
  return content.replace(/\]\(([^()\s]+)\)/g, (whole, target: string) =>
    target.startsWith(oldPrefix) ? `](${newPrefix}${target.slice(oldPrefix.length)})` : whole,
  );
}
