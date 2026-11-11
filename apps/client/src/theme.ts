import type { Color } from '@gur/engine';

export const colors = {
  table: '#1F5A3A',
  tableDark: '#16432B',
  felt: '#2A6B47',
  rack: '#B07A3B',
  rackEdge: '#8A5C2A',
  tile: '#FBF7EE',
  tileEdge: '#D9D0BE',
  text: '#FFFFFF',
  textMuted: '#CFE3D6',
  accent: '#F2C14E',
  selected: '#2F80ED',
  meld: '#5FD08A',
  danger: '#FF8A80',
  overlay: 'rgba(0, 0, 0, 0.6)',
  card: '#FFFFFF',
  cardText: '#1F2A24',
} as const;

/** Ink colour for each tile colour. Yellow is drawn as a deep amber so it reads on a cream tile. */
export const tileInk: Record<Color, string> = {
  red: '#D22B2B',
  yellow: '#E08A00',
  blue: '#1E6FD9',
  black: '#1B1B1B',
};
