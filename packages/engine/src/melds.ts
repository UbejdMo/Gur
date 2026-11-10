/**
 * Melds: sets and runs of 3 or more tiles. Wild tiles stand in for anything.
 */
import type { Color, Face } from './tiles';

/** Set: one number in different colours, 3 or 4 tiles. Two identical tiles can never share a set. */
export function isSet(faces: readonly Face[]): boolean {
  if (faces.length < 3 || faces.length > 4) return false;
  let num: number | null = null;
  const colors = new Set<Color>();
  for (const f of faces) {
    if (f.wild) continue;
    if (num === null) num = f.number;
    else if (f.number !== num) return false;
    if (colors.has(f.color)) return false;
    colors.add(f.color);
  }
  return true;
}

/**
 * Run: consecutive numbers in one colour, 3 or more tiles.
 * Positions 1..13 are the numbers; position 14 is a 1 placed after 13,
 * allowed only when the 12-13-1 option (aceHigh) is on. 13-1-2 is never valid.
 * The tiles in a group are treated as unordered.
 */
export function isRun(faces: readonly Face[], aceHigh: boolean): boolean {
  const len = faces.length;
  const maxPos = aceHigh ? 14 : 13;
  if (len < 3 || len > maxPos) return false;
  let color: Color | null = null;
  const nums: number[] = [];
  let ones = 0;
  for (const f of faces) {
    if (f.wild) continue;
    if (color === null) color = f.color;
    else if (f.color !== color) return false;
    if (f.number === 1) ones++;
    else nums.push(f.number);
  }
  if (new Set(nums).size !== nums.length) return false;
  for (let s = 1; s + len - 1 <= maxPos; s++) {
    const e = s + len - 1;
    if (nums.some((n) => n < s || n > e)) continue;
    let oneSlots = 0;
    if (s === 1) oneSlots++;
    if (aceHigh && e === 14) oneSlots++;
    if (ones <= oneSlots) return true;
  }
  return false;
}

export function isMeld(faces: readonly Face[], aceHigh: boolean): boolean {
  return isSet(faces) || isRun(faces, aceHigh);
}
