import { discardRowHeight, discardRowWidth, feltLayout, pileHeight, pileWidth, sidewaysRack } from '@/game/feltLayout';

describe('feltLayout, sideways', () => {
  it('on a desktop lays the table out as a cross, with your tiles under the pile', () => {
    const l = feltLayout(1216, 490, 44, { wide: true, panelWidth: 154, panelHeight: 50 });
    expect(l.arrangement).toBe('cross');
    expect(l.discardTile).toBe(34);
    expect(l.stacks).toBe(8);
    // across, pile and your row fit one under the other
    expect(2 * discardRowHeight(l.discardTile) + pileHeight(44)).toBeLessThanOrEqual(490);
  });

  it('on a phone puts your tiles beside the pile, so the tiles stay readable on a low table', () => {
    // 800 x 300, a phone inside a browser: the felt is about 772 x 118 inside its rim
    const l = feltLayout(772, 118, 18, { wide: true, dense: true, panelWidth: 128, maxDiscard: 25 });
    expect(l.arrangement).toBe('crossFlat');
    expect(l.discardTile).toBeGreaterThanOrEqual(22);
    // two lines: the row across, then the pile with your row beside it
    const line2 = Math.max(pileHeight(18, true), discardRowHeight(l.discardTile));
    expect(discardRowHeight(l.discardTile) + line2).toBeLessThanOrEqual(118);
    // three rows side by side, with the pile and your badge in the middle
    const centre = 772 - 2 * discardRowWidth(l.discardTile, 'none');
    expect(pileWidth(l.stacks, 18) + discardRowWidth(l.discardTile, 'full')).toBeLessThanOrEqual(centre);
  });

  it('keeps the cross when there is height for it', () => {
    const l = feltLayout(816, 182, 21, { wide: true, dense: true, panelWidth: 128, maxDiscard: 29 });
    expect(l.arrangement).toBe('cross');
    expect(l.discardTile).toBeGreaterThanOrEqual(26);
  });

  it('never makes tiles smaller than 12 points or larger than asked', () => {
    expect(feltLayout(300, 60, 22, { wide: true }).discardTile).toBe(12);
    expect(feltLayout(2000, 900, 44, { wide: true, maxDiscard: 30 }).discardTile).toBe(30);
  });
});

describe('feltLayout, upright', () => {
  it('gives each player a line when there is height for it', () => {
    const tall = feltLayout(338, 420, 24, { wide: false });
    expect(tall.arrangement).toBe('stack');
    expect(tall.discardTile).toBeGreaterThanOrEqual(26);
    expect(4 * discardRowHeight(tall.discardTile) + pileHeight(24)).toBeLessThanOrEqual(420);
    expect(discardRowWidth(tall.discardTile)).toBeLessThanOrEqual(338);
  });

  it('and two to a line, with narrow badges, when there is not', () => {
    const squat = feltLayout(338, 220, 24, { wide: false });
    expect(squat.arrangement).toBe('grid');
    expect(2 * discardRowWidth(squat.discardTile, 'compact')).toBeLessThanOrEqual(338);
    expect(squat.discardTile).toBeGreaterThanOrEqual(16);
  });
});

describe('sidewaysRack', () => {
  it('has 14 columns at the size the height allows when the room is there', () => {
    expect(sidewaysRack(580, 29, 16)).toEqual({ cols: 14, slot: 29, width: 14 * 29 + 32 });
  });

  it('shrinks the slots a little before it gives up columns', () => {
    // a desktop: 64-point slots would need 928 points; 852 are free
    expect(sidewaysRack(852, 64, 16)).toEqual({ cols: 14, slot: 58, width: 14 * 58 + 32 });
  });

  it('falls back to 12 columns on a small phone, and never overflows its room', () => {
    const r = sidewaysRack(371, 35, 16);
    expect(r.cols).toBe(12);
    expect(r.width).toBeLessThanOrEqual(371);
    expect(r.slot).toBe(28);
  });
});
