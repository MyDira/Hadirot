const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
];

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mov'];

const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

async function checkMagicBytes(blob: Blob): Promise<string | null> {
  const buffer = await blob.slice(0, 12).arrayBuffer();
  const b = new Uint8Array(buffer);

  // JPEG: FF D8 FF
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 &&
    b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A
  ) return 'image/png';

  // WebP: RIFF....WEBP (bytes 0–3 = 52 49 46 46, bytes 8–11 = 57 45 42 50)
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return 'image/webp';

  // GIF: GIF8
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';

  // WebM: 1A 45 DF A3
  if (b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) return 'video/webm';

  // MP4/MOV ftyp box: bytes 4–7 = 66 74 79 70 — return video/mp4 unconditionally
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'video/mp4';

  // Older QuickTime moov atom: bytes 4–7 = 6D 6F 6F 76
  if (b[4] === 0x6D && b[5] === 0x6F && b[6] === 0x6F && b[7] === 0x76) return 'video/quicktime';

  return null;
}

const isImage = (mimeType: string): boolean => mimeType.startsWith('image/');
const isVideo = (mimeType: string): boolean => mimeType.startsWith('video/');

export async function validateFile(
  blob: Blob,
  filename: string,
): Promise<{ valid: boolean; reason?: string }> {
  // Check 1 — MIME type
  if (!ALLOWED_MIME_TYPES.includes(blob.type)) {
    return { valid: false, reason: `disallowed MIME type: ${blob.type}` };
  }

  // Check 2 — File extension
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, reason: `disallowed file extension: .${ext}` };
  }

  // Check 3 — Magic bytes
  const detectedType = await checkMagicBytes(blob);
  if (detectedType === null) {
    return { valid: false, reason: 'unrecognized file signature' };
  }

  const declaredIsImage = isImage(blob.type);
  const detectedIsImage = isImage(detectedType);
  if (declaredIsImage !== detectedIsImage) {
    return { valid: false, reason: 'file signature does not match declared type' };
  }

  // Check 4 — Size
  const maxBytes = detectedIsImage ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
  if (blob.size > maxBytes) {
    const limitMB = detectedIsImage ? 8 : 100;
    return { valid: false, reason: `file exceeds size limit (${limitMB}MB)` };
  }

  return { valid: true };
}
