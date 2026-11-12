import { discardRowHeight, discardRowWidth, feltLayout, pileHeight, pileWidth } from '@/game/feltLayout';

describe('feltLayout', () => {
  it('on a desktop puts the rows beside the pile, with readable tiles and a long pile', () => {
    const l = feltLayout(866, 380, 44, true);
    expect(l.arrangement).toBe('sides');
    expect(l.discardTile).toBe(32);
    expect(l.stacks).toBeGreaterThanOrEqual(5);
    expect(2 * discardRowWidth(l.discardTile) + pileWidth(l.stacks, 44)).toBeLessThanOrEqual(866);
  });

  it('on a phone held sideways shortens the pile before it shrinks the discards', () => {
    const l = feltLayout(500, 88, 22, true);
    expect(l.arrangement).toBe('sides');
    expect(l.stacks).toBe(3);
    expect(l.discardTile).toBeGreaterThanOrEqual(18);
    // four rows and the pile all fit
    expect(2 * discardRowWidth(l.discardTile) + pileWidth(l.stacks, 22)).toBeLessThanOrEqual(500);
    expect(2 * discardRowHeight(l.discardTile)).toBeLessThanOrEqual(88);
  });

  it('on a phone held upright gives each player a line when there is height for it', () => {
    const tall = feltLayout(338, 420, 24, false);
    expect(tall.arrangement).toBe('stack');
    expect(tall.discardTile).toBeGreaterThanOrEqual(26);
    expect(4 * discardRowHeight(tall.discardTile) + pileHeight(24)).toBeLessThanOrEqual(420);
    expect(discardRowWidth(tall.discardTile)).toBeLessThanOrEqual(338);
  });

  it('and two to a line when there is not', () => {
    const squat = feltLayout(338, 220, 24, false);
    expect(squat.arrangement).toBe('grid');
    expect(2 * discardRowWidth(squat.discardTile, true)).toBeLessThanOrEqual(338);
    expect(squat.discardTile).toBeGreaterThanOrEqual(16);
  });

  it('never makes tiles smaller than 12 points or larger than asked', () => {
    expect(feltLayout(200, 60, 22, true).discardTile).toBe(12);
    expect(feltLayout(2000, 900, 44, true, 30).discardTile).toBe(30);
    expect(feltLayout(2000, 900, 44, true).stacks).toBe(8);
  });
});
