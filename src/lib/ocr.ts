import { invoke } from '@tauri-apps/api/core';

/**
 * One line of text the OCR found, with its box normalised to 0–1 and measured
 * from the top-left of the image (the Rust side flips Vision's bottom-left
 * origin before handing it over).
 */
export interface OcrLine {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A file waiting to be read: a screenshot or a PDF. */
export interface ImportSource {
  kind: 'image' | 'pdf';
  bytes: Uint8Array;
  /** Shown in the review panel so the user can tell which file a row came from. */
  name: string;
}

/**
 * Reads one source. A PDF yields one array of lines per page; an image yields
 * one page. Each page is parsed on its own — a syllabus with a calendar per
 * page would otherwise blur into one unreadable grid.
 */
export function recognize(source: ImportSource): Promise<OcrLine[][]> {
  // A Uint8Array goes over IPC as a raw body, not a JSON array of numbers.
  return source.kind === 'pdf'
    ? invoke<OcrLine[][]>('ocr_pdf', source.bytes)
    : invoke<OcrLine[]>('ocr_image', source.bytes).then((lines) => [lines]);
}

const PDF_RE = /\.pdf$/i;
const IMAGE_RE = /\.(png|jpe?g|gif|webp|heic|heif|tiff?|bmp)$/i;

/** What a dropped, pasted, or picked file is to us, or null if neither. */
export function kindOf(name: string, mime = ''): ImportSource['kind'] | null {
  if (mime === 'application/pdf' || PDF_RE.test(name)) return 'pdf';
  if (mime.startsWith('image/') || IMAGE_RE.test(name)) return 'image';
  return null;
}

/** Every importable file in a paste or drop, in order. Non-matches are skipped. */
export async function sourcesFromFiles(files: FileList | File[] | null | undefined): Promise<ImportSource[]> {
  const out: ImportSource[] = [];
  for (const file of Array.from(files ?? [])) {
    const kind = kindOf(file.name, file.type);
    if (!kind) continue;
    out.push({ kind, name: file.name || (kind === 'pdf' ? 'Pasted PDF' : 'Pasted image'), bytes: new Uint8Array(await file.arrayBuffer()) });
  }
  return out;
}

/** Opens the native picker for one or more images or PDFs. Empty if cancelled. */
export async function pickSources(): Promise<ImportSource[]> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const { readFile } = await import('@tauri-apps/plugin-fs');
  const picked = await open({
    multiple: true,
    directory: false,
    filters: [
      { name: 'Images and PDFs', extensions: ['png', 'jpg', 'jpeg', 'webp', 'heic', 'tiff', 'pdf'] },
    ],
  });
  const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
  const out: ImportSource[] = [];
  for (const path of paths) {
    const name = path.split('/').pop() ?? path;
    const kind = kindOf(name);
    if (!kind) continue;
    out.push({ kind, name, bytes: await readFile(path) });
  }
  return out;
}
