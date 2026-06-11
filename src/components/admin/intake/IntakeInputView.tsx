import React, { useState, useRef } from 'react';
import {
  Plus,
  Trash2,
  ImagePlus,
  Loader2,
  Sparkles,
  AlertCircle,
  Star,
} from 'lucide-react';
import type { Profile, IntakeImage } from '@/config/supabase';
import { aiIntakeService, type IntakeBlockInput, type ParseBlocksResult } from '@/services/aiIntake';
import { UserSearchSelect } from '@/components/admin/UserSearchSelect';
import { useAuth } from '@/hooks/useAuth';

interface IntakeInputViewProps {
  onParsed: (result: ParseBlocksResult) => void;
}

interface BlockState {
  uid: string;
  text: string;
  typeHint: 'auto' | 'rental' | 'sale';
  assignedUser: Profile | null;
  customAgencyName: string;
  listingTypeDisplay: '' | 'agent' | 'owner';
  images: IntakeImage[];
  uploading: boolean;
}

function newBlock(): BlockState {
  return {
    uid: crypto.randomUUID(),
    text: '',
    typeHint: 'auto',
    assignedUser: null,
    customAgencyName: '',
    listingTypeDisplay: '',
    images: [],
    uploading: false,
  };
}

export function IntakeInputView({ onParsed }: IntakeInputViewProps) {
  const { user } = useAuth();
  const [blocks, setBlocks] = useState<BlockState[]>([newBlock()]);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const updateBlock = (uid: string, patch: Partial<BlockState>) => {
    setBlocks((prev) => prev.map((b) => (b.uid === uid ? { ...b, ...patch } : b)));
  };

  const removeBlock = (uid: string) => {
    setBlocks((prev) => (prev.length > 1 ? prev.filter((b) => b.uid !== uid) : prev));
  };

  const handleUploadImages = async (uid: string, files: FileList | null) => {
    if (!files || files.length === 0 || !user?.id) return;
    updateBlock(uid, { uploading: true });
    setError(null);
    try {
      const uploaded: IntakeImage[] = [];
      for (const file of Array.from(files)) {
        uploaded.push(await aiIntakeService.uploadIntakeImage(file, user.id));
      }
      setBlocks((prev) =>
        prev.map((b) => {
          if (b.uid !== uid) return b;
          const images = [...b.images, ...uploaded];
          // Default the first photo to featured.
          if (images.length > 0 && !images.some((i) => i.is_featured)) {
            images[0] = { ...images[0], is_featured: true };
          }
          return { ...b, images, uploading: false };
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed.');
      updateBlock(uid, { uploading: false });
    } finally {
      const input = fileInputRefs.current[uid];
      if (input) input.value = '';
    }
  };

  const handleRemoveImage = (uid: string, index: number) => {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.uid !== uid) return b;
        const removed = b.images[index];
        // Input-stage uploads aren't referenced anywhere else yet — clean up.
        if (removed) void aiIntakeService.deleteIntakeImage(removed.filePath);
        const images = b.images.filter((_, i) => i !== index);
        if (images.length > 0 && !images.some((i) => i.is_featured)) {
          images[0] = { ...images[0], is_featured: true };
        }
        return { ...b, images };
      }),
    );
  };

  const handleSetFeatured = (uid: string, index: number) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.uid === uid
          ? { ...b, images: b.images.map((img, i) => ({ ...img, is_featured: i === index })) }
          : b,
      ),
    );
  };

  const handleParse = async () => {
    const filled = blocks.filter((b) => b.text.trim().length > 0);
    if (filled.length === 0) {
      setError('Paste listing text into at least one block.');
      return;
    }
    if (blocks.some((b) => b.uploading)) {
      setError('Wait for photo uploads to finish.');
      return;
    }

    const payload: IntakeBlockInput[] = filled.map((b) => ({
      text: b.text.trim(),
      type_hint: b.typeHint,
      assigned_user_id: b.assignedUser?.id ?? null,
      admin_custom_agency_name: b.assignedUser ? null : b.customAgencyName.trim() || null,
      admin_listing_type_display: b.assignedUser ? null : b.listingTypeDisplay || null,
      image_paths: b.images,
    }));

    setParsing(true);
    setError(null);
    try {
      const result = await aiIntakeService.parseBlocks(payload);
      setBlocks([newBlock()]);
      onParsed(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Parsing failed. Please try again.');
    } finally {
      setParsing(false);
    }
  };

  const inputClass =
    'px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        Paste raw listing text below — each block can hold <strong>one or many</strong> listings;
        the AI detects and splits them automatically. Photos and the account assignment on a block
        apply to <strong>every</strong> listing found in that block. Use separate blocks when
        different listings need different photos or accounts.
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {blocks.map((block, blockIndex) => (
        <div key={block.uid} className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Block {blockIndex + 1}</h3>
            <div className="flex items-center gap-3">
              <select
                value={block.typeHint}
                onChange={(e) =>
                  updateBlock(block.uid, { typeHint: e.target.value as BlockState['typeHint'] })
                }
                className={inputClass}
                title="Listing kind hint for the AI"
              >
                <option value="auto">Auto-detect kind</option>
                <option value="rental">Rentals</option>
                <option value="sale">Sales</option>
                <option value="commercial" disabled>
                  Commercial (coming soon)
                </option>
              </select>
              {blocks.length > 1 && (
                <button
                  onClick={() => removeBlock(block.uid)}
                  className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
                  title="Remove block"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <textarea
            value={block.text}
            onChange={(e) => updateBlock(block.uid, { text: e.target.value })}
            rows={8}
            placeholder={
              'Paste listing text here — one listing or twenty.\n\nExample:\n3BR apt 53/14, 2nd flr, w/d hookup, $2,400. Call 718-555-1234\n2BR bsmt 15-40 sep ent $1,800 ...'
            }
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Photos */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-600">
                  Photos (applied to every listing in this block)
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRefs.current[block.uid]?.click()}
                  disabled={block.uploading || parsing}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {block.uploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ImagePlus className="w-3.5 h-3.5" />
                  )}
                  Add
                </button>
                <input
                  ref={(el) => {
                    fileInputRefs.current[block.uid] = el;
                  }}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleUploadImages(block.uid, e.target.files)}
                />
              </div>
              {block.images.length === 0 ? (
                <p className="text-xs text-gray-400">No photos</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {block.images.map((img, i) => (
                    <div key={`${img.filePath}-${i}`} className="relative group w-16 h-16">
                      <img
                        src={img.publicUrl}
                        alt=""
                        className="w-full h-full object-cover rounded-md border border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => handleSetFeatured(block.uid, i)}
                        title={img.is_featured ? 'Featured photo' : 'Make featured'}
                        className={`absolute top-0.5 left-0.5 p-0.5 rounded ${
                          img.is_featured
                            ? 'bg-yellow-400 text-white'
                            : 'bg-black/40 text-white opacity-0 group-hover:opacity-100'
                        } transition-opacity`}
                      >
                        <Star className="w-3 h-3" fill={img.is_featured ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(block.uid, i)}
                        title="Remove photo"
                        className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Assignment */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">
                Assign every listing in this block to an account (optional)
              </label>
              <UserSearchSelect
                selectedUser={block.assignedUser}
                onSelect={(u) => updateBlock(block.uid, { assignedUser: u })}
                placeholder="Search users by name, email, or agency..."
              />
              {!block.assignedUser && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={block.customAgencyName}
                    onChange={(e) =>
                      updateBlock(block.uid, { customAgencyName: e.target.value.slice(0, 100) })
                    }
                    maxLength={100}
                    placeholder="Custom poster name (optional)"
                    className={`${inputClass} w-full`}
                  />
                  <select
                    value={block.listingTypeDisplay}
                    onChange={(e) =>
                      updateBlock(block.uid, {
                        listingTypeDisplay: e.target.value as BlockState['listingTypeDisplay'],
                      })
                    }
                    className={`${inputClass} w-full`}
                  >
                    <option value="">Display as...</option>
                    <option value="agent">Real Estate Agent</option>
                    <option value="owner">By Owner</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <button
          onClick={() => setBlocks((prev) => [...prev, newBlock()])}
          disabled={parsing}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Another Block
        </button>

        <button
          onClick={handleParse}
          disabled={parsing}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {parsing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Parsing with AI... this can take a minute
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Parse Listings
            </>
          )}
        </button>
      </div>
    </div>
  );
}
