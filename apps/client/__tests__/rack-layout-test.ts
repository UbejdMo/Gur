import { SLOTS_PER_ROW, initialLayout, layoutGroups, moveToSlot, reconcile, sameGroups } from '@/game/rackLayout';
import { dropTarget } from '@/components/Rack';

const hand14 = Array.from({ length: 14 }, (_, i) => i + 1);

describe('rack layout', () => {
  it('deals 7 tiles to the top row and 7 to the bottom', () => {
    const layout = initialLayout(hand14);
    expect(layout).toHaveLength(SLOTS_PER_ROW * 2);
    expect(layout.slice(0, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(layout.slice(SLOTS_PER_ROW, SLOTS_PER_ROW + 7)).toEqual([8, 9, 10, 11, 12, 13, 14]);
    expect(layoutGroups(layout)).toEqual([
      [1, 2, 3, 4, 5, 6, 7],
      [8, 9, 10, 11, 12, 13, 14],
    ]);
  });

  it('puts a 15th tile in a slot of its own, away from other tiles', () => {
    const layout = initialLayout([...hand14, 99]);
    const slot = layout.indexOf(99);
    expect(layout[slot - 1]).toBeNull();
    expect(layoutGroups(layout)).toContainEqual([99]);
  });

  it('an empty slot splits a row into groups, and rows never join', () => {
    const layout = initialLayout(hand14);
    const moved = moveToSlot(layout, 4, 10);
    expect(layoutGroups(moved)).toEqual([[1, 2, 3], [5, 6, 7], [4], [8, 9, 10, 11, 12, 13, 14]]);
    // last slot of the top row and first of the bottom row are not neighbours
    const edge = moveToSlot(layout, 7, SLOTS_PER_ROW - 1);
    expect(layoutGroups(edge)).toContainEqual([7]);
  });

  it('dropping on another tile swaps the two', () => {
    const layout = initialLayout(hand14);
    const swapped = moveToSlot(layout, 1, SLOTS_PER_ROW);
    expect(swapped[0]).toBe(8);
    expect(swapped[SLOTS_PER_ROW]).toBe(1);
  });

  it('follows the hand: removes discards and places new tiles', () => {
    const layout = initialLayout(hand14);
    const next = reconcile(
      layout,
      hand14.filter((t) => t !== 3),
    );
    expect(next).not.toContain(3);
    expect(next[2]).toBeNull();
    expect(reconcile(layout, [...hand14, 50])).toContain(50);
  });

  it('compares groups regardless of order', () => {
    expect(sameGroups([[1, 2], [3]], [[3], [2, 1]])).toBe(true);
    expect(sameGroups([[1, 2], [3]], [[1], [2, 3]])).toBe(false);
  });

  it('rejects unknown tiles and slots', () => {
    const layout = initialLayout(hand14);
    expect(() => moveToSlot(layout, 99, 0)).toThrow();
    expect(() => moveToSlot(layout, 1, 99)).toThrow();
  });
});

describe('dropTarget', () => {
  const slot = 30;
  const stride = 60;

  it('finds the slot from how far the tile moved', () => {
    expect(dropTarget(0, 0, 0, slot, stride)).toBe(0);
    expect(dropTarget(0, 95, 0, slot, stride)).toBe(3);
    expect(dropTarget(2, -61, 0, slot, stride)).toBe(0);
    expect(dropTarget(0, 0, 58, slot, stride)).toBe(SLOTS_PER_ROW);
    expect(dropTarget(SLOTS_PER_ROW + 1, 0, -62, slot, stride)).toBe(1);
  });

  it('treats a drag up off the rack as a discard', () => {
    expect(dropTarget(3, 0, -45, slot, stride)).toBe('up');
    expect(dropTarget(SLOTS_PER_ROW + 3, 10, -120, slot, stride)).toBe('up');
  });

  it('snaps back when dropped off the sides or below', () => {
    expect(dropTarget(0, -40, 0, slot, stride)).toBeNull();
    expect(dropTarget(SLOTS_PER_ROW - 1, 40, 0, slot, stride)).toBeNull();
    expect(dropTarget(SLOTS_PER_ROW, 0, 70, slot, stride)).toBeNull();
  });
});
