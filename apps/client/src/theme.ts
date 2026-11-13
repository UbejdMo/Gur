import type { Color } from '@gur/engine';

export const colors = {
  backdrop: '#1C1F1E',
  backdropPanel: '#262A28',
  panelEdge: '#3A403C',
  table: '#1F5A3A',
  tableDark: '#16432B',
  felt: '#2F7A3E',
  feltEdge: '#123321',
  feltRim: '#0E1A14',
  wood: '#7A4A22',
  woodPlank: '#9A6233',
  woodLight: '#B9824C',
  woodDark: '#4E2D12',
  bolt: '#C9C2B4',
  rack: '#B07A3B',
  rackEdge: '#8A5C2A',
  tile: '#FFFCF5',
  // A tile that is out of the game (a discard nobody can take): darker face, same strong ink.
  tileGone: '#D8D1C2',
  tileBack: '#EDE6D6',
  tileEdge: '#CFC5B0',
  // The star on the printed joker.
  star: '#7A3FC4',
  text: '#FFFFFF',
  textMuted: '#C9D2CC',
  accent: '#F2C14E',
  jokerBox: '#8E1B1B',
  selected: '#2F80ED',
  meld: '#5FD08A',
  danger: '#FF8A80',
  overlay: 'rgba(0, 0, 0, 0.6)',
  card: '#FFFFFF',
  cardText: '#1F2A24',
} as const;

/**
 * Ink colour for each tile colour: deep, saturated and far apart, so a tile's colour is clear
 * at a glance even when it is small. Yellow is a deep amber so it reads on a cream tile.
 */
export const tileInk: Record<Color, string> = {
  red: '#D4001A',
  yellow: '#D98A00',
  blue: '#0A4BD6',
  black: '#0D0D0D',
};
