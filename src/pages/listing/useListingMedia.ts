import { useState, useCallback } from "react";
import { listingsService } from "../../services/listings";
import { compressImage } from "../../utils/imageUtils";
import type { MediaFile } from "../../components/shared/MediaUploader";

interface UseListingMediaOptions {
  userId: string | null | undefined;
  isSaleListing: boolean;
  // PostListing has an anonymous path: images get blob preview URLs until the
  // user signs in, then uploadPendingMedia() finalizes them. EditListing
  // requires a signed-in user and uploads immediately.
  allowAnonymous?: boolean;
  // EditListing needs to know which existing images/videos to delete from
  // storage on submit. PostListing ignores this (nothing exists yet).
  trackExistingForDelete?: boolean;
  // PostListing uses this to kick off draft auto-save tracking on first
  // interaction. EditListing doesn't need it.
  onInteraction?: () => void;
  // Initial media (EditListing loads existing images from the listing row).
  initialMedia?: MediaFile[];
}

interface UseListingMediaResult {
  mediaFiles: MediaFile[];
  setMediaFiles: React.Dispatch<React.SetStateAction<MediaFile[]>>;
  mediaToDelete: string[];
  setMediaToDelete: React.Dispatch<React.SetStateAction<string[]>>;
  uploadingMedia: boolean;
  setUploadingMedia: React.Dispatch<React.SetStateAction<boolean>>;
  handleMediaAdd: (files: File[]) => Promise<void>;
  handleMediaRemove: (id: string) => void;
  handleSetFeatured: (id: string) => void;
  uploadPendingMedia: () => Promise<boolean>;
  maxAllowedFiles: number;
  maxAllowedImages: number;
}

export function useListingMedia(options: UseListingMediaOptions): UseListingMediaResult {
  const {
    userId,
    isSaleListing,
    allowAnonymous = false,
    trackExistingForDelete = false,
    onInteraction,
    initialMedia,
  } = options;

  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>(initialMedia ?? []);
  const [mediaToDelete, setMediaToDelete] = useState<string[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const maxAllowedFiles = isSaleListing ? 21 : 11;
  const maxAllowedImages = isSaleListing ? 20 : 10;

  const handleMediaAdd = useCallback(async (files: File[]) => {
    onInteraction?.();

    if (!userId && !allowAnonymous) {
      alert("Please sign in to upload media");
      return;
    }

    if (mediaFiles.length + files.length > maxAllowedFiles) {
      alert(
        `Maximum ${maxAllowedFiles - 1} images + 1 video allowed${
          isSaleListing ? " for sale listings" : ""
        }`,
      );
      return;
    }

    const videoCount = mediaFiles.filter((m) => m.type === "video").length;
    setUploadingMedia(true);

    try {
      let hasFeatured = mediaFiles.some((m) => m.is_featured);
      const newMedia: MediaFile[] = [];

      for (const file of files) {
        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");

        if (!isImage && !isVideo) {
          alert(`${file.name} is not a supported file type`);
          continue;
        }

        if (isVideo) {
          if (videoCount + newMedia.filter((m) => m.type === "video").length >= 1) {
            alert("Maximum 1 video allowed");
            continue;
          }
          if (file.size > 100 * 1024 * 1024) {
            alert(`${file.name} is too large. Maximum video size is 100MB`);
            continue;
          }
          const videoUrl = URL.createObjectURL(file);
          newMedia.push({
            id: `video-${Date.now()}-${Math.random()}`,
            type: "video",
            file,
            url: videoUrl,
            is_featured: false,
            originalName: file.name,
          });
          continue;
        }

        // Image branch
        let fileToUpload: File = file;
        if (file.size > 8 * 1024 * 1024) {
          try {
            const compressed = await compressImage(file, { quality: 0.8, maxWidth: 1920 });
            if (compressed.size > 8 * 1024 * 1024) {
              alert(`${file.name} is too large even after compression (8MB limit)`);
              continue;
            }
            fileToUpload = new File(
              [compressed],
              file.name.replace(/\.[^.]+$/, ".jpg"),
              { type: "image/jpeg" },
            );
          } catch (err) {
            console.error("Error compressing image:", err);
            alert(`Failed to process ${file.name}`);
            continue;
          }
        }

        const is_featured = !hasFeatured;
        if (!hasFeatured) hasFeatured = true;

        if (!userId) {
          // Anonymous path: keep a local blob URL until user signs in.
          const previewUrl = URL.createObjectURL(fileToUpload);
          newMedia.push({
            id: `img-${Date.now()}-${Math.random()}`,
            type: "image",
            file: fileToUpload,
            url: previewUrl,
            is_featured,
            originalName: file.name,
          });
          continue;
        }

        try {
          const { filePath, publicUrl } = await listingsService.uploadTempListingImage(
            fileToUpload,
            userId,
          );
          newMedia.push({
            id: `img-${Date.now()}-${Math.random()}`,
            type: "image",
            url: publicUrl,
            filePath,
            publicUrl,
            is_featured,
            originalName: file.name,
          });
        } catch (error) {
          console.error("Error uploading temp image:", error);
          alert(`Failed to upload ${file.name}. Please try again.`);
        }
      }

      if (newMedia.length > 0) {
        setMediaFiles((prev) => {
          const updated = hasFeatured ? prev.map((m) => ({ ...m, is_featured: false })) : [...prev];
          return [...updated, ...newMedia];
        });
      }
    } finally {
      setUploadingMedia(false);
    }
  }, [userId, allowAnonymous, isSaleListing, maxAllowedFiles, mediaFiles, onInteraction]);

  const handleMediaRemove = useCallback((id: string) => {
    onInteraction?.();
    const mediaToRemove = mediaFiles.find((m) => m.id === id);

    if (mediaToRemove) {
      if (trackExistingForDelete && mediaToRemove.isExisting) {
        setMediaToDelete((prev) => [...prev, id]);
      }
      if (mediaToRemove.url.startsWith("blob:")) {
        URL.revokeObjectURL(mediaToRemove.url);
      }
    }

    setMediaFiles((prev) => {
      const remaining = prev.filter((m) => m.id !== id);
      if (mediaToRemove?.is_featured && remaining.length > 0) {
        const firstImage = remaining.find((m) => m.type === "image");
        if (firstImage) {
          return remaining.map((m) => ({ ...m, is_featured: m.id === firstImage.id }));
        }
      }
      return remaining;
    });
  }, [mediaFiles, onInteraction, trackExistingForDelete]);

  const handleSetFeatured = useCallback((id: string) => {
    onInteraction?.();
    setMediaFiles((prev) =>
      prev.map((m) => ({ ...m, is_featured: m.id === id && m.type === "image" })),
    );
  }, [onInteraction]);

  // Finalizes anonymous image uploads once a user has signed in. No-op for
  // EditListing (user is always signed in, so no pending blob images).
  const uploadPendingMedia = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    const pending = mediaFiles.filter((m) => m.type === "image" && !m.filePath && m.file);
    if (pending.length === 0) return true;

    setUploadingMedia(true);
    try {
      const updates: { id: string; filePath: string; publicUrl: string }[] = [];
      for (const entry of pending) {
        try {
          const { filePath, publicUrl } = await listingsService.uploadTempListingImage(
            entry.file!,
            userId,
          );
          updates.push({ id: entry.id, filePath, publicUrl });
        } catch (err) {
          console.error(`Error uploading ${entry.originalName}:`, err);
          alert(`Failed to upload ${entry.originalName || "image"}. Please try again.`);
          return false;
        }
      }
      setMediaFiles((prev) =>
        prev.map((m) => {
          const update = updates.find((u) => u.id === m.id);
          if (!update) return m;
          return { ...m, filePath: update.filePath, publicUrl: update.publicUrl, url: update.publicUrl };
        }),
      );
      return true;
    } finally {
      setUploadingMedia(false);
    }
  }, [mediaFiles, userId]);

  return {
    mediaFiles,
    setMediaFiles,
    mediaToDelete,
    setMediaToDelete,
    uploadingMedia,
    setUploadingMedia,
    handleMediaAdd,
    handleMediaRemove,
    handleSetFeatured,
    uploadPendingMedia,
    maxAllowedFiles,
    maxAllowedImages,
  };
}
