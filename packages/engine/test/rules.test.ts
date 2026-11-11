import { describe, expect, it } from 'vitest';
import {
  TILE_COUNT,
  checkClosingHand,
  faceOf,
  identicalPairCount,
  isMeld,
  jokerFromIndicator,
  penalty,
  tileValue,
} from '../src';
import type { Joker } from '../src';
import { t, ts } from './helpers';

const plainJoker: Joker = jokerFromIndicator(t('R12')); // joker is red 13, unused in the hands below
const meld = (codes: string, aceHigh = true, joker = plainJoker) =>
  isMeld(
    ts(codes).map((id) => faceOf(id, joker)),
    aceHigh,
  );
const closing = (codes: string, aceHigh = true, joker = plainJoker) => checkClosingHand(ts(codes), joker, aceHigh);

describe('tiles and joker', () => {
  it('has 106 tiles', () => {
    expect(TILE_COUNT).toBe(106);
  });

  it('the joker is one above the indicator in the same colour, and 1 after 13', () => {
    expect(jokerFromIndicator(t('R10'))).toEqual({ color: 'red', number: 11 });
    expect(jokerFromIndicator(t('Y1'))).toEqual({ color: 'yellow', number: 2 });
    expect(jokerFromIndicator(t('B13'))).toEqual({ color: 'blue', number: 1 });
    expect(() => jokerFromIndicator(t('J'))).toThrow();
  });

  it('both real joker tiles are wild; the printed joker counts as the joker number', () => {
    const j = jokerFromIndicator(t('Y1'));
    expect(faceOf(t('Y2'), j)).toEqual({ wild: true });
    expect(faceOf(t('Y2b'), j)).toEqual({ wild: true });
    expect(faceOf(t('J'), j)).toEqual({ wild: false, color: 'yellow', number: 2 });
  });

  it('tiles count at face value; jokers count the joker number', () => {
    const j = jokerFromIndicator(t('Y1'));
    expect(tileValue(t('K13'), j)).toBe(13);
    expect(tileValue(t('R1'), j)).toBe(1);
    expect(tileValue(t('Y2'), j)).toBe(2);
    expect(tileValue(t('J'), j)).toBe(2);
    expect(ts('K13 R1 R2').reduce((s, id) => s + tileValue(id, j), 0)).toBe(16);
  });
});

describe('melds', () => {
  it('runs: consecutive, one colour, 3 or more', () => {
    expect(meld('B3 B4 B5')).toBe(true);
    expect(meld('B1 B2 B3 B4 B5 B6 B7 B8 B9 B10 B11 B12 B13')).toBe(true);
    expect(meld('B3 B4')).toBe(false);
    expect(meld('B3 B4 R5')).toBe(false);
    expect(meld('B3 B5 B6')).toBe(false);
  });

  it('sets: one number, different colours, 3 or 4', () => {
    expect(meld('R8 Y8 B8')).toBe(true);
    expect(meld('R8 Y8 B8 K8')).toBe(true);
    expect(meld('K8 K8b Y8')).toBe(false);
    expect(meld('R8 Y8 B8 K8 R8b')).toBe(false);
  });

  it('12-13-1 follows the option; 13-1-2 is never valid', () => {
    expect(meld('B11 B12 B13', false)).toBe(true);
    expect(meld('B1 B2 B3', false)).toBe(true);
    expect(meld('B12 B13 B1', true)).toBe(true);
    expect(meld('B12 B13 B1', false)).toBe(false);
    expect(meld('B13 B1 B2', true)).toBe(false);
  });

  it('the real joker stands in anywhere; the printed joker does not', () => {
    const j = jokerFromIndicator(t('Y1')); // joker = yellow 2
    expect(meld('R8 Y8 Y2', true, j)).toBe(true);
    expect(meld('R5 Y2 R7', true, j)).toBe(true);
    expect(meld('R12 R13 Y2', false, j)).toBe(true);
    expect(meld('Y1 J Y3', true, j)).toBe(true); // printed joker as yellow 2
    expect(meld('R5 J R7', true, j)).toBe(false);
  });
});

describe('closing hands from the tutorial screenshots', () => {
  it('normal: 4+4+3+3', () => {
    expect(closing('K11 B11 R11 Y11 Y7 Y8 Y9 Y10 R3 R4 R5 K3 B3 R3b')?.kind).toBe('melds');
  });

  it('bicolor, with 12-13-1', () => {
    expect(closing('B12 B13 B1 Y7 Y8 Y9 Y10 Y11 B2 B3 B4 B4b B5 B6')?.kind).toBe('melds');
    expect(closing('B12 B13 B1 Y7 Y8 Y9 Y10 Y11 B2 B3 B4 B4b B5 B6', false)).toBeNull();
  });

  it('minors and majors', () => {
    expect(closing('B1 Y1 R1 Y3 Y4 Y5 Y6 Y7 R2 R3 R4 B4 B5 B6')?.kind).toBe('melds');
    expect(closing('B1 Y1 R1 K9 K10 K11 K12 R8 R9 R10 R11 B8 Y8 K8')?.kind).toBe('melds');
  });

  it('monocolor needs 12-13-1 on when it ends 13-1', () => {
    const hand = 'Y1 Y2 Y3 Y4 Y4b Y5 Y6 Y7 Y9 Y10 Y11 Y12 Y13 Y1b';
    expect(closing(hand, true)?.kind).toBe('melds');
    expect(closing(hand, false)).toBeNull();
  });

  it('seven pairs', () => {
    expect(closing('Y3 Y3b Y8 Y8b K9 K9b K12 K12b R8 R8b K11 K11b Y2 Y2b')?.kind).toBe('sevenPairs');
    expect(closing('Y3 Y4 Y8 Y8b K9 K9b K12 K12b R8 R8b K11 K11b Y2 Y2b')).toBeNull();
  });

  it('eight of a kind needs the other 6 tiles in melds', () => {
    expect(closing('R8 R8b K8 K8b Y8 Y8b B8 B8b Y3 Y4 Y5 K9 B9 R9')?.kind).toBe('melds');
    expect(closing('R8 R8b K8 K8b Y8 Y8b B8 B8b Y3 Y7 Y4 Y5 K9 B9')).toBeNull();
  });

  it('mosaic only with 12-13-1 on', () => {
    const hand = 'Y1 K2 B3 R4 K5 B6 R7 Y8 K9 R10 Y11 K12 Y13 B1';
    expect(closing(hand, true)?.kind).toBe('mosaic');
    expect(closing(hand, false)).toBeNull();
    // neighbours sharing a colour break it
    expect(closing('Y1 K2 B3 R4 R5 B6 R7 Y8 K9 R10 Y11 K12 Y13 B1', true)).toBeNull();
  });

  it('other splits: 4+5+5 and 7+7', () => {
    expect(closing('R1 R2 R3 R4 Y1 Y2 Y3 Y4 Y5 B1 B2 B3 B4 B5')?.kind).toBe('melds');
    expect(closing('Y1 Y2 Y3 Y4 Y5 Y6 Y7 B1 B2 B3 B4 B5 B6 B7')?.kind).toBe('melds');
  });

  it('the joker can stand in for a tile in any hand', () => {
    const j = jokerFromIndicator(t('Y1')); // joker = yellow 2
    // seven pairs with a joker as half of a pair
    expect(closing('Y3 Y2 Y8 Y8b K9 K9b K12 K12b R8 R8b K11 K11b B2 B2b', true, j)?.kind).toBe('sevenPairs');
    // mosaic with a joker standing in for red 4
    expect(closing('Y1 K2 B3 Y2 K5 B6 R7 Y8 K9 R10 Y11 K12 Y13 B1', true, j)?.kind).toBe('mosaic');
    // melds with a joker filling a gap
    expect(closing('K11 B11 R11 Y11 Y7 Y8 Y2 Y10 R3 R4 R5 K3 B3 R3b', true, j)?.kind).toBe('melds');
  });
});

describe('unconnected tiles and the restart check', () => {
  it('counts tiles as the player arranged them', () => {
    const groups = [ts('B1 B2 B3'), ts('K13'), ts('R13')];
    expect(penalty(groups, plainJoker, true)).toBe(26);
    // same tiles, badly arranged: nothing is connected
    const bad = [ts('B1 B2'), ts('B3 K13 R13')];
    expect(penalty(bad, plainJoker, true)).toBe(32);
  });

  it('3 identical pairs offer a restart', () => {
    expect(identicalPairCount(ts('R1 R1b Y7 Y7b K9 K9b B2 B3'))).toBe(3);
    expect(identicalPairCount(ts('R1 R1b Y7 Y7b K9'))).toBe(2);
  });
});
