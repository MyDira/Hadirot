import { convertHeicToJpeg, isHeicFile, isImageFile } from './heicConvert';

const MAX_DIMENSION = 2400;
const OUTPUT_QUALITY = 0.85;
const SKIP_BELOW_BYTES = 500 * 1024;

export async function resizeImageForUpload(inputFile: File): Promise<File> {
  if (!isImageFile(inputFile)) return inputFile;

  // HEIC first, before any early return below — a small HEIC would otherwise
  // skip the resize path and upload as an undisplayable .heic. This is the
  // single chokepoint for every image upload in the app, so converting here
  // covers listings, commercial listings and AI intake alike.
  let file = inputFile;
  if (isHeicFile(inputFile)) {
    file = await convertHeicToJpeg(inputFile);
  }

  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  if (file.size < SKIP_BELOW_BYTES) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const { width: srcW, height: srcH } = bitmap;
  const maxSide = Math.max(srcW, srcH);

  if (maxSide <= MAX_DIMENSION) {
    bitmap.close?.();
    return file;
  }

  const scale = MAX_DIMENSION / maxSide;
  const dstW = Math.round(srcW * scale);
  const dstH = Math.round(srcH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    return file;
  }

  ctx.drawImage(bitmap, 0, 0, dstW, dstH);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', OUTPUT_QUALITY);
  });

  if (!blob || blob.size >= file.size) return file;

  const baseName = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  });
}
