import { useCallback, useState } from 'react';
import type { IntakeImage } from '@/config/supabase';
import { aiIntakeService } from '@/services/aiIntake';
import { compressImage } from '@/utils/imageUtils';
import type { MediaFile } from '@/components/shared/MediaUploader';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export function intakeImagesToMediaFiles(images: IntakeImage[]): MediaFile[] {
  return images.map((img) => ({
    id: img.filePath,
    type: img.type === 'video' ? 'video' : 'image',
    url: img.type === 'video' ? img.thumbnailUrl || img.publicUrl : img.publicUrl,
    publicUrl: img.publicUrl,
    filePath: img.filePath,
    is_featured: img.is_featured,
    isExisting: true,
  }));
}

interface UseIntakeMediaOptions {
  adminId: string | null | undefined;
  images: IntakeImage[];
  onChange: (images: IntakeImage[]) => void;
  maxFiles?: number;
  onUploadingChange?: (uploading: boolean) => void;
  /**
   * Whether removing an item also deletes it from storage. Default true
   * (input-stage blocks own their uploads exclusively). Set false when a
   * block has already been parsed into multiple sibling listings that may
   * still reference the same storage file — removal there should only
   * detach it from this listing, matching the pre-existing edit-modal
   * behavior.
   */
  deleteOnRemove?: boolean;
}

/**
 * Mirrors src/pages/listing/useListingMedia.ts, adapted for intake: media
 * uploads immediately to the shared intake storage folder (there's no
 * listing row yet — one text block can become several listings), whereas
 * the real forms defer video upload until the listing itself is created.
 */
export function useIntakeMedia({
  adminId,
  images,
  onChange,
  maxFiles = 11,
  onUploadingChange,
  deleteOnRemove = true,
}: UseIntakeMediaOptions) {
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploadingState] = useState(false);

  const setUploading = useCallback(
    (value: boolean) => {
      setUploadingState(value);
      onUploadingChange?.(value);
    },
    [onUploadingChange],
  );

  const handleMediaAdd = useCallback(
    async (files: File[]) => {
      if (!adminId) {
        setError('Sign in to upload media.');
        return;
      }
      if (images.length + files.length > maxFiles) {
        setError(`Maximum ${maxFiles} files allowed.`);
        return;
      }

      const videoCount = images.filter((i) => i.type === 'video').length;
      setError(null);
      setUploading(true);
      try {
        const uploaded: IntakeImage[] = [];
        let newVideoCount = 0;

        for (const file of files) {
          const isImage = file.type.startsWith('image/');
          const isVideo = file.type.startsWith('video/');

          if (!isImage && !isVideo) {
            setError(`${file.name} is not a supported file type.`);
            continue;
          }

          if (isVideo) {
            if (videoCount + newVideoCount >= 1) {
              setError('Only one video is allowed per block.');
              continue;
            }
            if (file.size > MAX_VIDEO_BYTES) {
              setError(`${file.name} is too large. Maximum video size is 100MB.`);
              continue;
            }
            uploaded.push(await aiIntakeService.uploadIntakeVideo(file, adminId));
            newVideoCount++;
            continue;
          }

          let fileToUpload = file;
          if (file.size > MAX_IMAGE_BYTES) {
            try {
              const compressed = await compressImage(file, { quality: 0.8, maxWidth: 1920 });
              if (compressed.size > MAX_IMAGE_BYTES) {
                setError(`${file.name} is too large even after compression (8MB limit).`);
                continue;
              }
              fileToUpload = new File(
                [compressed],
                file.name.replace(/\.[^.]+$/, '.jpg'),
                { type: 'image/jpeg' },
              );
            } catch {
              setError(`Failed to process ${file.name}.`);
              continue;
            }
          }
          uploaded.push(await aiIntakeService.uploadIntakeImage(fileToUpload, adminId));
        }

        if (uploaded.length > 0) {
          const merged = [...images, ...uploaded];
          if (!merged.some((i) => i.is_featured)) {
            const firstImageIndex = merged.findIndex((i) => i.type !== 'video');
            if (firstImageIndex >= 0) {
              merged[firstImageIndex] = { ...merged[firstImageIndex], is_featured: true };
            }
          }
          onChange(merged);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Media upload failed.');
      } finally {
        setUploading(false);
      }
    },
    [adminId, images, maxFiles, onChange, setUploading],
  );

  const handleMediaRemove = useCallback(
    (id: string) => {
      const removed = images.find((i) => i.filePath === id);
      if (removed && deleteOnRemove) void aiIntakeService.deleteIntakeMedia(removed);

      const remaining = images.filter((i) => i.filePath !== id);
      if (removed?.is_featured && remaining.length > 0 && !remaining.some((i) => i.is_featured)) {
        const firstImageIndex = remaining.findIndex((i) => i.type !== 'video');
        if (firstImageIndex >= 0) {
          onChange(
            remaining.map((i, idx) => ({ ...i, is_featured: idx === firstImageIndex })),
          );
          return;
        }
      }
      onChange(remaining);
    },
    [images, onChange, deleteOnRemove],
  );

  const handleSetFeatured = useCallback(
    (id: string) => {
      onChange(images.map((i) => ({ ...i, is_featured: i.filePath === id && i.type !== 'video' })));
    },
    [images, onChange],
  );

  return { error, setError, uploading, handleMediaAdd, handleMediaRemove, handleSetFeatured };
}
