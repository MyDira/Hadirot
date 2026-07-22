// intakeSplit — plans the Claude calls for the admin AI Intake paste screen.
//
// A pasted block used to be one Claude call, and the whole paste one edge-
// function request. Past ~30 rows that request outlived the gateway's wall
// clock and the entire parse was lost. Blocks are now split into units the
// client drives one at a time, exactly like the pamphlet page chunks.
//
// Pure text handling, no Supabase import — so it is cheap to test.

import type { IntakeImage } from '@/config/supabase';

/** Rows per unit. parse-pamphlet measured 49 listings ≈ 51.5k output tokens. */
export const MAX_ROWS_PER_UNIT = 25;
/** Second cap, for prose-heavy rows: keeps a unit's input around ~3k tokens. */
export const MAX_CHARS_PER_UNIT = 12000;

export interface IntakeBlockLike {
  text: string;
  type_hint: 'auto' | 'rental' | 'sale';
  assigned_user_id: string | null;
  admin_custom_agency_name: string | null;
  admin_listing_type_display: 'agent' | 'owner' | null;
  image_paths: IntakeImage[];
}

export interface IntakeUnitInput extends Omit<IntakeBlockLike, 'text'> {
  text: string;
  block_index: number;
  /** true when the unit was cut out of a run-on paste with no blank-line breaks. */
  partial: boolean;
}

/**
 * Split one block's text into pieces. Blank lines are the reliable listing
 * boundary, so they win; a paragraph that is itself too big to be one unit is
 * re-split by line with a one-line overlap, because a listing can wrap across
 * lines and a clean cut is not guaranteed. The overlap is safe: a listing seen
 * twice collapses onto one row via the dedup key.
 */
function splitBlockText(text: string): Array<{ text: string; rows: number; partial: boolean }> {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const pieces: Array<{ text: string; rows: number; partial: boolean }> = [];
  for (const paragraph of paragraphs) {
    const lines = paragraph
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    // Fits as-is: keep the paragraph whole (no duplicated input tokens).
    if (lines.length <= MAX_ROWS_PER_UNIT && paragraph.length <= MAX_CHARS_PER_UNIT) {
      pieces.push({ text: paragraph, rows: Math.max(1, lines.length), partial: false });
      continue;
    }
    // Run-on paste: cut it into overlapping line windows.
    for (let start = 0; start < lines.length; start += MAX_ROWS_PER_UNIT - 1) {
      const window = lines.slice(start, start + MAX_ROWS_PER_UNIT);
      if (window.length === 0) break;
      pieces.push({ text: window.join('\n'), rows: window.length, partial: true });
      if (start + MAX_ROWS_PER_UNIT >= lines.length) break;
    }
  }
  return pieces;
}

/** Plan the Claude calls for a set of pasted blocks. */
export function splitBlocksIntoUnits(blocks: IntakeBlockLike[]): IntakeUnitInput[] {
  const units: IntakeUnitInput[] = [];

  blocks.forEach((block, blockIndex) => {
    const meta = {
      block_index: blockIndex,
      type_hint: block.type_hint,
      assigned_user_id: block.assigned_user_id,
      admin_custom_agency_name: block.admin_custom_agency_name,
      admin_listing_type_display: block.admin_listing_type_display,
      // Media and assignment apply to every listing in the block, so every
      // unit cut from that block carries them.
      image_paths: block.image_paths,
    };

    let buffer: string[] = [];
    let bufferRows = 0;
    let bufferChars = 0;
    let bufferPartial = false;

    const flush = () => {
      if (buffer.length === 0) return;
      units.push({ ...meta, text: buffer.join('\n\n'), partial: bufferPartial });
      buffer = [];
      bufferRows = 0;
      bufferChars = 0;
      bufferPartial = false;
    };

    for (const piece of splitBlockText(block.text)) {
      const wouldOverflow =
        buffer.length > 0 &&
        (bufferRows + piece.rows > MAX_ROWS_PER_UNIT ||
          bufferChars + piece.text.length > MAX_CHARS_PER_UNIT);
      if (wouldOverflow) flush();
      buffer.push(piece.text);
      bufferRows += piece.rows;
      bufferChars += piece.text.length;
      bufferPartial = bufferPartial || piece.partial;
    }
    flush();
  });

  return units;
}
