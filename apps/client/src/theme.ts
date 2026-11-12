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
  tile: '#FBF7EE',
  tileBack: '#EDE6D6',
  tileEdge: '#D9D0BE',
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

/** Ink colour for each tile colour. Yellow is drawn as a deep amber so it reads on a cream tile. */
export const tileInk: Record<Color, string> = {
  red: '#D22B2B',
  yellow: '#E08A00',
  blue: '#1E6FD9',
  black: '#1B1B1B',
};
