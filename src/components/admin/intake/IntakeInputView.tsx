import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import type { Profile, IntakeImage } from '@/config/supabase';
import { aiIntakeService, type IntakeBlockInput, type ParseBlocksResult } from '@/services/aiIntake';
import { UserSearchSelect } from '@/components/admin/UserSearchSelect';
import { useAuth } from '@/hooks/useAuth';
import { IntakeMediaField } from './IntakeMediaField';

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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState<ParseBlocksResult | null>(null);

  const updateBlock = (uid: string, patch: Partial<BlockState>) => {
    setBlocks((prev) => prev.map((b) => (b.uid === uid ? { ...b, ...patch } : b)));
  };

  const removeBlock = (uid: string) => {
    setBlocks((prev) => (prev.length > 1 ? prev.filter((b) => b.uid !== uid) : prev));
  };

  const handleParse = async () => {
    const filled = blocks.filter((b) => b.text.trim().length > 0);
    if (filled.length === 0) {
      setError('Paste listing text into at least one block.');
      return;
    }
    if (blocks.some((b) => b.uploading)) {
      setError('Wait for media uploads to finish.');
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
    setPartial(null);
    setProgress({ done: 0, total: 0 });
    try {
      const result = await aiIntakeService.parseBlocks(payload, (done, total) =>
        setProgress({ done, total }),
      );
      if (result.errors.length === 0) {
        setBlocks([newBlock()]);
        onParsed(result);
        return;
      }
      // Partial run: keep the pasted text on screen so nothing has to be
      // re-typed, and let the admin decide whether to review or retry.
      if (result.inserted === 0 && (result.updated ?? 0) === 0) {
        setError(result.errors[0].error);
      } else {
        setPartial(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Parsing failed. Please try again.');
    } finally {
      setParsing(false);
      setProgress(null);
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

      {partial && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-900 space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">
                Parsed {partial.parsed} listing{partial.parsed === 1 ? '' : 's'} —{' '}
                {partial.inserted} new, {partial.updated ?? 0} merged. {partial.errors.length}{' '}
                group{partial.errors.length === 1 ? '' : 's'} failed:
              </p>
              <ul className="mt-1 list-disc list-inside space-y-0.5 text-amber-800">
                {partial.errors.slice(0, 4).map((e, i) => (
                  <li key={i}>
                    Block {e.block + 1}: {e.error}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-amber-800">
                The text above is untouched — you can re-run it, or open the review screen for
                what did land.
              </p>
            </div>
          </div>
          <button
            onClick={() => onParsed(partial)}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 rounded-md hover:bg-amber-700 transition-colors"
          >
            Open review
          </button>
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
            {/* Photos & video */}
            <IntakeMediaField
              adminId={user?.id}
              images={block.images}
              onChange={(images) => updateBlock(block.uid, { images })}
              label="Photos & video (applied to every listing in this block)"
              maxFiles={block.typeHint === 'sale' ? 21 : 11}
              disabled={parsing}
              onUploadingChange={(uploading) => updateBlock(block.uid, { uploading })}
            />

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
              {progress && progress.total > 0
                ? `Parsing group ${Math.min(progress.done + 1, progress.total)} of ${progress.total}...`
                : 'Parsing with AI...'}
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
