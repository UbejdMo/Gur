/* eslint-disable react-hooks/refs -- dragging keeps the pressed tile in a ref: it is written and read
   only inside touch handlers, which run outside render. */
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { ComponentRef, Ref } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { faceOf, isMeld, isRealJoker } from '@gur/engine';
import type { Joker, TileId } from '@gur/engine';
import { Tile } from './Tile';
import { MAX_COLS, MIN_COLS, ROWS, colsOf } from '@/game/rackLayout';
import type { Layout, Side } from '@/game/rackLayout';
import { colors } from '@/theme';

const PAD = 16; // room for the bolts at each end
const PAD_TOP = 8;
const ROW_GAP = 6;
const BAR = 4;
// Each row is a wooden plank: padding and edges around the tiles.
const PLANK_TOP = 3 + 5; // light edge + padding
const PLANK_BOTTOM = 5 + 4; // padding + dark edge

type Props = {
  layout: Layout;
  joker: Joker;
  aceHigh: boolean;
  selected: TileId | null;
  onSelect: (tile: TileId) => void;
  onMoveSelected: (slot: number) => void;
  /** A tile was dropped on a slot; `side` is the half of the slot it landed on. */
  onDrop: (tile: TileId, slot: number, side: Side) => void;
  /** A tile was dragged up off the rack, towards the discard pile. */
  onDropUp: (tile: TileId) => void;
  /** Largest slot width in points, so the rack fits the screen's height too. */
  maxSlot?: number;
  /** The rack has room for a different number of columns than the layout has. */
  onResize?: (cols: number) => void;
  ref?: Ref<RackHandle>;
};

/** A place on the rack: a slot, and which half of it was aimed at. */
export type RackPlace = { slot: number; side: Side };

export type RackHandle = {
  /** Finds the place under a point on the screen, for tiles dragged onto the rack from the table. */
  locate: (pageX: number, pageY: number, found: (place: RackPlace | null) => void) => void;
};

/**
 * Your two-row rack, as wide as the screen: every part of it takes tiles. Drag a tile to any
 * slot; dropped on another tile it slides in beside it (left or right half) and the others
 * move along. Drag it up off the rack to discard it. You can also tap a tile, then tap a slot.
 * Tiles side by side form a group; a green bar under a group means it is a meld, which is
 * what a close needs.
 */
export function Rack({
  layout,
  joker,
  aceHigh,
  selected,
  onSelect,
  onMoveSelected,
  onDrop,
  onDropUp,
  maxSlot = 64,
  onResize,
  ref,
}: Props) {
  // The rack, not each tile, handles dragging: it contains every tile, so it sees the pointer
  // wherever it moves. Pressing a tile marks it; moving the pointer then drags that tile.
  // Set synchronously at the very start of a press, so even a quick flick knows which tile it moved.
  const pressed = useRef<{ tile: TileId; slot: number; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState<TileId | null>(null);
  const [pan] = useState(() => new Animated.ValueXY());
  // A sensible phone width until the real width is known.
  const [measured, setMeasured] = useState<number | null>(null);
  const rackRef = useRef<ComponentRef<typeof View>>(null);

  // Tiles are as big as the screen's height allows; the rack then has as many columns as fit
  // across it, so the whole width is usable.
  const cols = colsOf(layout);
  const avail = (measured ?? 360) - PAD * 2;
  const ideal = Math.max(22, Math.min(maxSlot, Math.floor(avail / MIN_COLS)));
  const wantCols = Math.max(MIN_COLS, Math.min(MAX_COLS, Math.floor(avail / ideal)));
  const slot = Math.max(14, Math.min(Math.floor(avail / cols), Math.ceil(ideal * 1.15)));
  // Any width left over is shared between the two ends.
  const inset = Math.max(0, Math.floor((avail - cols * slot) / 2));
  const tileW = slot - 2;
  const rowH = Math.round(tileW * 1.4) + BAR + 2;

  const rows = Array.from({ length: ROWS }, (_, r) => layout.slice(r * cols, (r + 1) * cols));
  const rowStride = rowH + PLANK_TOP + PLANK_BOTTOM + ROW_GAP;

  useEffect(() => {
    if (measured !== null && wantCols !== cols) onResize?.(wantCols);
  }, [measured, wantCols, cols, onResize]);

  useImperativeHandle(
    ref,
    () => ({
      locate: (pageX, pageY, found) => {
        const rack = rackRef.current;
        if (!rack) return found(null);
        rack.measureInWindow((x, y) =>
          found(placeAt((pageX - x - PAD - inset) / slot, (pageY - y - PAD_TOP + ROW_GAP / 2) / rowStride, cols)),
        );
      },
    }),
    [cols, inset, slot, rowStride],
  );

  // Rebuilt when a tile is pressed or the rack is resized, never during a drag.
  const responder = useMemo(() => {
    const reset = () => {
      pan.setOffset({ x: 0, y: 0 });
      pan.setValue({ x: 0, y: 0 });
      setDragging(null);
      pressed.current = null;
    };
    return PanResponder.create({
      // Runs first on every press (outermost first); a tile underneath then marks itself.
      onStartShouldSetPanResponderCapture: () => {
        pressed.current = null;
        return false;
      },
      // A tap stays a tap; once the pointer moves, the drag takes over.
      onMoveShouldSetPanResponderCapture: (_e, g) =>
        pressed.current !== null && (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6),
      onPanResponderGrant: (_e, g) => {
        // The drag only starts after a few pixels; count the movement from where the press began.
        const from = pressed.current;
        if (from) pan.setOffset({ x: g.moveX - from.x, y: g.moveY - from.y });
        pan.setValue({ x: 0, y: 0 });
        setDragging(from?.tile ?? null);
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_e, g) => {
        const from = pressed.current;
        reset();
        if (!from) return;
        const target = dropTarget(from.slot, g.moveX - from.x, g.moveY - from.y, slot, rowStride, cols);
        if (target === 'up') onDropUp(from.tile);
        else if (target !== null && target.slot !== from.slot) onDrop(from.tile, target.slot, target.side);
      },
      onPanResponderTerminate: reset,
    });
  }, [pan, slot, rowStride, cols, onDrop, onDropUp]);

  return (
    <View
      {...responder.panHandlers}
      ref={rackRef}
      style={styles.rack}
      testID="rack"
      onLayout={(e: LayoutChangeEvent) => setMeasured(e.nativeEvent.layout.width)}
    >
      {avail > 0 &&
        rows.map((cells, r) => (
          <View
            key={r}
            style={[styles.plank, dragging !== null && cells.includes(dragging) && styles.liftedRow]}
            testID="rack-row"
          >
            <View style={[styles.bolt, styles.boltLeft]} />
            <View style={[styles.bolt, styles.boltRight]} />
            <View style={[styles.row, { height: rowH, marginLeft: inset }]}>
              {segments(cells).map((seg) => {
                const base = r * cols + seg.start;
                if (seg.tiles.length === 0) {
                  return (
                    <Pressable
                      key={`empty-${base}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Empty slot ${base + 1}`}
                      testID="rack-slot-empty"
                      onPress={() => selected !== null && onMoveSelected(base)}
                      style={[
                        styles.empty,
                        { width: slot, height: rowH - BAR - 2 },
                        selected !== null && styles.emptyActive,
                      ]}
                    />
                  );
                }
                const meld =
                  seg.tiles.length >= 3 &&
                  isMeld(
                    seg.tiles.map((t) => faceOf(t, joker)),
                    aceHigh,
                  );
                return (
                  <View key={`run-${base}`} testID={meld ? 'rack-meld' : 'rack-group'}>
                    <View style={styles.run}>
                      {seg.tiles.map((t, i) => (
                        <Animated.View
                          key={t}
                          onStartShouldSetResponderCapture={(e) => {
                            pressed.current = {
                              tile: t,
                              slot: base + i,
                              x: e.nativeEvent.pageX,
                              y: e.nativeEvent.pageY,
                            };
                            return false;
                          }}
                          style={[
                            { width: slot, alignItems: 'center' },
                            dragging === t && [styles.dragging, { transform: pan.getTranslateTransform() }],
                          ]}
                        >
                          <Tile
                            id={t}
                            width={tileW}
                            testID="rack-tile"
                            wild={isRealJoker(t, joker)}
                            selected={selected === t}
                            onPress={() =>
                              selected === null || selected === t ? onSelect(t) : onMoveSelected(base + i)
                            }
                          />
                        </Animated.View>
                      ))}
                    </View>
                    <View style={[styles.bar, meld && styles.barMeld]} />
                  </View>
                );
              })}
            </View>
          </View>
        ))}
    </View>
  );
}

/** Splits a row into runs of tiles and single empty slots. */
function segments(cells: Layout): { start: number; tiles: TileId[] }[] {
  const out: { start: number; tiles: TileId[] }[] = [];
  cells.forEach((t, i) => {
    const last = out.at(-1);
    if (t === null) out.push({ start: i, tiles: [] });
    else if (last && last.tiles.length > 0 && last.start + last.tiles.length === i) last.tiles.push(t);
    else out.push({ start: i, tiles: [t] });
  });
  return out;
}

/**
 * The place at a point on the rack, measured in slots across and rows down from the first slot.
 * Null when the point is off the rack.
 */
export function placeAt(across: number, down: number, cols: number): RackPlace | null {
  const row = Math.floor(down);
  // Half a slot of grace past either end still counts as the end slot.
  if (row < 0 || row >= ROWS || across < -0.5 || across > cols + 0.5) return null;
  const col = Math.min(cols - 1, Math.max(0, Math.floor(across)));
  return { slot: row * cols + col, side: across - col < 0.5 ? 'left' : 'right' };
}

/**
 * Where a drag ends, from where it started and how far it moved: a place on the
 * rack, "up" when it left the rack upwards, or null to snap back.
 */
export function dropTarget(
  from: number,
  dx: number,
  dy: number,
  slotWidth: number,
  rowStride: number,
  cols: number,
): RackPlace | 'up' | null {
  // Follow the middle of the dragged tile.
  const across = (from % cols) + 0.5 + dx / slotWidth;
  const down = Math.floor(from / cols) + 0.5 + dy / rowStride;
  if (down < -0.1) return 'up';
  return placeAt(across, down, cols);
}

const styles = StyleSheet.create({
  rack: {
    width: '100%',
    paddingHorizontal: PAD,
    paddingVertical: PAD_TOP,
    gap: ROW_GAP,
    borderRadius: 14,
    backgroundColor: colors.wood,
    borderBottomWidth: 8,
    borderBottomColor: colors.woodDark,
  },
  plank: {
    marginHorizontal: -PAD + 6,
    paddingHorizontal: PAD - 6,
    paddingTop: 5,
    paddingBottom: 5,
    borderRadius: 8,
    backgroundColor: colors.woodPlank,
    borderTopWidth: 3,
    borderTopColor: colors.woodLight,
    borderBottomWidth: 4,
    borderBottomColor: colors.woodDark,
  },
  bolt: {
    position: 'absolute',
    top: '50%',
    marginTop: -3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bolt,
    borderWidth: 1,
    borderColor: colors.woodDark,
  },
  boltLeft: { left: 2 },
  boltRight: { right: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  run: { flexDirection: 'row' },
  bar: { height: BAR, marginTop: 2, marginHorizontal: 2, borderRadius: 2 },
  barMeld: { backgroundColor: colors.meld },
  empty: { borderRadius: 6 },
  // While a tile is picked, the free slots lighten a little: no outlines, the whole rack is in play.
  emptyActive: { backgroundColor: 'rgba(255, 255, 255, 0.07)' },
  // In the air the tile lets the pointer through: letting go must not count as a click on it
  // (a browser would send one, because the tile is still under the pointer, and select it).
  dragging: { zIndex: 10, elevation: 10, opacity: 0.9, pointerEvents: 'none' },
  liftedRow: { zIndex: 10, elevation: 10 },
});
