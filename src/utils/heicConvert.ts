// HEIC/HEIF → JPEG conversion.
//
// iPhones shoot HEIC by default. Safari on iOS transcodes to JPEG on its way
// into a file input, but nothing else does — a HEIC picked from macOS Finder,
// Chrome, or Android reaches us as-is. No browser except Safari can decode
// HEIC, so an unconverted file uploads successfully and then renders as a
// broken <img> everywhere on the site. That failure is silent: the upload
// genuinely succeeded, only the decode failed.
//
// So we transcode to JPEG in the browser before anything else touches the file.
//
// Library note: this uses `heic-to`, NOT `heic2any`. heic2any's libheif WASM
// instance is a module-level singleton whose heap is never reclaimed; it
// aborts with `abort(12)` on the third conversion in a page session and stays
// broken until reload. That is fatal here — posting a listing means picking
// 5-10 photos at once. heic-to was verified to run 8 consecutive conversions
// with no failures. Don't swap it back without re-testing a multi-photo batch.
//
// The decoder carries a WASM build, so it is imported dynamically — the chunk
// is only fetched when someone actually picks a HEIC.

/** MIME types iOS and Android use for HEIC/HEIF stills and burst sequences. */
const HEIC_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

const HEIC_EXTENSION = /\.(heic|heif)$/i;

/**
 * Cheap synchronous "looks like HEIC" test, for classifying a picked file
 * without reading its bytes.
 *
 * Checks the extension as well as the MIME type on purpose: browsers derive
 * `File.type` from the OS, and for HEIC it is frequently the empty string on
 * Windows and older Chrome. Extension is the more reliable signal here.
 *
 * May false-positive on a mislabelled file — convertHeicToJpeg re-checks the
 * actual magic bytes before doing any work.
 */
export function isHeicFile(file: File): boolean {
  return HEIC_MIME_TYPES.has(file.type.toLowerCase()) || HEIC_EXTENSION.test(file.name);
}

/**
 * Transcode a HEIC/HEIF file to JPEG. Anything that isn't really HEIC — by
 * magic bytes, not by name — is returned untouched.
 *
 * Throws if the file is genuinely HEIC but cannot be decoded, so callers can
 * surface a real message instead of uploading something no browser can display.
 */
export async function convertHeicToJpeg(file: File, quality = 0.85): Promise<File> {
  if (!isHeicFile(file)) return file;

  const { heicTo, isHeic } = await import('heic-to');

  // Authoritative check: a .heic name on a file that is actually a JPEG would
  // otherwise blow up in the decoder.
  if (!(await isHeic(file))) return file;

  const blob = await heicTo({ blob: file, type: 'image/jpeg', quality });
  if (!blob) throw new Error(`Could not read ${file.name} — the HEIC file may be corrupt.`);

  return new File([blob], file.name.replace(HEIC_EXTENSION, '.jpg'), {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  });
}

/**
 * True if the file is an image, counting HEIC/HEIF even when the browser
 * reports an empty `File.type`. Use instead of `file.type.startsWith('image/')`
 * anywhere a user-picked file is validated.
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || isHeicFile(file);
}

/**
 * Convert every HEIC/HEIF file in a picked batch to JPEG, passing other files
 * through untouched.
 *
 * Files that fail to convert are dropped and returned in `failed` rather than
 * passed along: uploading them would put an image on the listing that no
 * browser can render, which is worse than telling the user it didn't take.
 */
export async function convertHeicBatch(
  files: File[],
): Promise<{ files: File[]; failed: string[] }> {
  const converted: File[] = [];
  const failed: string[] = [];

  for (const file of files) {
    if (!isHeicFile(file)) {
      converted.push(file);
      continue;
    }
    try {
      converted.push(await convertHeicToJpeg(file));
    } catch (err) {
      console.error(`HEIC conversion failed for ${file.name}:`, err);
      failed.push(file.name);
    }
  }

  return { files: converted, failed };
}

/** Shared copy for the "we couldn't read your HEIC" alert. */
export function heicFailureMessage(names: string[]): string {
  return `Couldn't convert ${names.join(', ')} from HEIC. Please re-save as JPEG and try again.`;
}
