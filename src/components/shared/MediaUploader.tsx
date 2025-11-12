import React, { useState } from "react";
import { Upload, X, Star, Film, Image as ImageIcon } from "lucide-react";

export interface MediaFile {
  id: string;
  type: 'image' | 'video';
  file?: File;
  url: string;
  filePath?: string;
  publicUrl?: string;
  is_featured: boolean;
  originalName?: string;
  isExisting?: boolean;
}

interface MediaUploaderProps {
  mediaFiles: MediaFile[];
  onMediaAdd: (files: File[]) => Promise<void>;
  onMediaRemove: (id: string) => void;
  onSetFeatured: (id: string) => void;
  maxFiles?: number;
  disabled?: boolean;
  uploading?: boolean;
  showAuthWarning?: boolean;
}

export function MediaUploader({
  mediaFiles,
  onMediaAdd,
  onMediaRemove,
  onSetFeatured,
  maxFiles = 11,
  disabled = false,
  uploading = false,
  showAuthWarning = false,
}: MediaUploaderProps) {
  const [dragActive, setDragActive] = useState(false);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    await onMediaAdd(files);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await onMediaAdd(files);
    e.target.value = '';
  };

  const getMediaIcon = (media: MediaFile) => {
    if (media.type === 'video') {
      return <Film className="w-6 h-6 text-white" />;
    }
    return null;
  };

  const getFileTypeLabel = (media: MediaFile) => {
    if (media.type === 'video') {
      return 'Video';
    }
    return 'Image';
  };

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <label className="block w-full">
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
              dragActive
                ? 'border-[#273140] bg-gray-50'
                : 'border-gray-300 hover:border-[#273140]'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {uploading ? (
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#273140] mx-auto mb-2"></div>
            ) : (
              <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            )}
            <span className="text-sm text-gray-600">
              {uploading
                ? "Uploading..."
                : "Click to upload images & videos or drag and drop"}
            </span>
            <span className="text-xs text-gray-500 block mt-1">
              Images: PNG, JPG up to 8MB | Videos: MP4, WebM, MOV up to 100MB
            </span>
            <span className="text-xs text-gray-500 block mt-1">
              Maximum {maxFiles} files total
            </span>
          </div>
          <input
            type="file"
            multiple
            accept="image/*,video/mp4,video/webm,video/quicktime"
            onChange={handleFileSelect}
            className="hidden"
            disabled={disabled || uploading || mediaFiles.length >= maxFiles}
          />
        </label>
      </div>

      {mediaFiles.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {mediaFiles.map((media) => (
            <div key={media.id} className="relative group">
              {media.type === 'video' ? (
                <div className="relative w-full h-32 bg-black rounded-lg overflow-hidden">
                  <video
                    src={media.url}
                    className="w-full h-full object-cover"
                    muted
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
                    {getMediaIcon(media)}
                  </div>
                </div>
              ) : (
                <img
                  src={media.url}
                  alt={media.originalName || 'Media'}
                  className="w-full h-32 object-cover rounded-lg"
                />
              )}

              <div className="absolute top-2 left-2 px-2 py-1 bg-black bg-opacity-60 text-white text-xs rounded">
                {getFileTypeLabel(media)}
              </div>

              <button
                type="button"
                onClick={() => onMediaRemove(media.id)}
                className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-4 h-4" />
              </button>

              {media.type === 'image' && (
                <button
                  type="button"
                  onClick={() => onSetFeatured(media.id)}
                  className={`absolute bottom-2 left-2 px-2 py-1 rounded text-xs font-medium transition-colors ${
                    media.is_featured
                      ? "bg-accent-500 text-white"
                      : "bg-black bg-opacity-50 text-white hover:bg-accent-600"
                  }`}
                >
                  {media.is_featured ? (
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3" />
                      Featured
                    </span>
                  ) : (
                    "Set Featured"
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showAuthWarning && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-800">
            Please sign in to upload images and videos. Your form data will be saved automatically.
          </p>
        </div>
      )}

      <p className="text-xs text-gray-500">
        {mediaFiles.length === 0 && "If you don't upload media, a tasteful stock photo will be shown on your public listing."}
        {mediaFiles.length > 0 && `${mediaFiles.length} of ${maxFiles} files uploaded. ${mediaFiles.filter(m => m.type === 'image').length} image(s), ${mediaFiles.filter(m => m.type === 'video').length} video(s).`}
        {mediaFiles.length > 0 && mediaFiles.filter(m => m.type === 'image').length === 0 && " Video thumbnail will be used for listing cards."}
      </p>
    </div>
  );
}
