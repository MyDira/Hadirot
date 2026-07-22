import { describe, it, expect } from 'vitest';
import { splitBlocksIntoUnits, MAX_ROWS_PER_UNIT, type IntakeBlockLike } from './intakeSplit';

const block = (text: string, extra: Partial<IntakeBlockLike> = {}): IntakeBlockLike => ({
  text,
  type_hint: 'auto',
  assigned_user_id: null,
  admin_custom_agency_name: null,
  admin_listing_type_display: null,
  image_paths: [],
  ...extra,
});

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => `r${i} 3BR apt 53/14, 2nd flr, $2,400. Call 718-555-0000`);

describe('splitBlocksIntoUnits', () => {
  it('keeps a small block as a single, whole unit', () => {
    const units = splitBlocksIntoUnits([block(rows(5).join('\n'))]);
    expect(units).toHaveLength(1);
    expect(units[0].partial).toBe(false);
  });

  it('splits a run-on paste into capped units without losing a row', () => {
    const all = rows(60);
    const units = splitBlocksIntoUnits([block(all.join('\n'))]);

    expect(units.length).toBeGreaterThan(1);
    for (const unit of units) {
      expect(unit.text.split('\n').length).toBeLessThanOrEqual(MAX_ROWS_PER_UNIT);
      expect(unit.partial).toBe(true);
    }
    const seen = new Set(units.flatMap((u) => u.text.split('\n')));
    for (const line of all) expect(seen.has(line)).toBe(true);
  });

  it('groups blank-line paragraphs with no duplicated text', () => {
    const units = splitBlocksIntoUnits([block(rows(60).join('\n\n'))]);
    const lines = units.flatMap((u) => u.text.split('\n').filter(Boolean));

    // Blank lines are trustworthy boundaries, so no overlap is needed — and no
    // input tokens are paid twice.
    expect(lines).toHaveLength(60);
    expect(new Set(lines).size).toBe(60);
    expect(units.every((u) => !u.partial)).toBe(true);
  });

  it('carries block metadata and index onto every unit cut from that block', () => {
    const units = splitBlocksIntoUnits([
      block('one row'),
      block(rows(60).join('\n'), { assigned_user_id: 'user-1' }),
    ]);

    expect(units[0].block_index).toBe(0);
    const fromSecond = units.filter((u) => u.block_index === 1);
    expect(fromSecond.length).toBeGreaterThan(1);
    expect(fromSecond.every((u) => u.assigned_user_id === 'user-1')).toBe(true);
  });

  it('ignores blank blocks', () => {
    expect(splitBlocksIntoUnits([block('   \n\n  ')])).toHaveLength(0);
  });
});
