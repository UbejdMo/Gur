/* eslint-disable react-hooks/refs -- dragging keeps the pressed tile in a ref: it is written and read
   only inside touch handlers, which run outside render. */
import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { faceOf, isMeld, isRealJoker } from '@gur/engine';
import type { Joker, TileId } from '@gur/engine';
import { Tile } from './Tile';
import { ROWS, SLOTS_PER_ROW } from '@/game/rackLayout';
import type { Layout } from '@/game/rackLayout';
import { colors } from '@/theme';

const PAD = 8;
const ROW_GAP = 10;
const BAR = 4;

type Props = {
  layout: Layout;
  joker: Joker;
  aceHigh: boolean;
  selected: TileId | null;
  onSelect: (tile: TileId) => void;
  onMoveSelected: (slot: number) => void;
  onDrop: (tile: TileId, slot: number) => void;
  /** A tile was dragged up off the rack, towards the discard pile. */
  onDropUp: (tile: TileId) => void;
};

/**
 * Your two-row rack. Drag a tile to any slot (onto another tile to swap them),
 * or drag it up off the rack to discard it. You can also tap a tile, then tap a
 * slot. Tiles side by side form a group; a green bar under a group means it is a
 * meld, which is all that counts as connected when someone closes.
 */
export function Rack({ layout, joker, aceHigh, selected, onSelect, onMoveSelected, onDrop, onDropUp }: Props) {
  // The rack, not each tile, handles dragging: it contains every tile, so it sees the pointer
  // wherever it moves. Pressing a tile marks it; moving the pointer then drags that tile.
  // Set synchronously at the very start of a press, so even a quick flick knows which tile it moved.
  const pressed = useRef<{ tile: TileId; slot: number; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState<TileId | null>(null);
  const [pan] = useState(() => new Animated.ValueXY());
  // A sensible phone width until the real width is known.
  const [width, setWidth] = useState(360);

  const slot = Math.max(22, Math.min(48, Math.floor((width - PAD * 2) / SLOTS_PER_ROW)));
  const tileW = slot - 2;
  const rowH = Math.round(tileW * 1.4) + BAR + 2;

  const rows = Array.from({ length: ROWS }, (_, r) => layout.slice(r * SLOTS_PER_ROW, (r + 1) * SLOTS_PER_ROW));
  const rowStride = rowH + ROW_GAP;

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
        const target = dropTarget(from.slot, g.moveX - from.x, g.moveY - from.y, slot, rowStride);
        if (target === 'up') onDropUp(from.tile);
        else if (target !== null && target !== from.slot) onDrop(from.tile, target);
      },
      onPanResponderTerminate: reset,
    });
  }, [pan, slot, rowStride, onDrop, onDropUp]);

  return (
    <View
      {...responder.panHandlers}
      style={styles.rack}
      testID="rack"
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 &&
        rows.map((cells, r) => (
          <View
            key={r}
            style={[styles.row, { height: rowH }, dragging !== null && cells.includes(dragging) && styles.liftedRow]}
            testID="rack-row"
          >
            {segments(cells).map((seg) => {
              const base = r * SLOTS_PER_ROW + seg.start;
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
                          pressed.current = { tile: t, slot: base + i, x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
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
                          onPress={() => (selected === null || selected === t ? onSelect(t) : onMoveSelected(base + i))}
                        />
                      </Animated.View>
                    ))}
                  </View>
                  <View style={[styles.bar, meld && styles.barMeld]} />
                </View>
              );
            })}
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
 * Where a drag ends, from where it started and how far it moved: a slot on the
 * rack, "up" when it left the rack upwards, or null to snap back.
 */
export function dropTarget(
  from: number,
  dx: number,
  dy: number,
  slotWidth: number,
  rowStride: number,
): number | 'up' | null {
  const col = (from % SLOTS_PER_ROW) + Math.round(dx / slotWidth);
  const rowFloat = Math.floor(from / SLOTS_PER_ROW) + dy / rowStride;
  if (rowFloat < -0.6) return 'up';
  const row = Math.round(rowFloat);
  if (row < 0 || row >= ROWS || col < 0 || col >= SLOTS_PER_ROW) return null;
  return row * SLOTS_PER_ROW + col;
}

const styles = StyleSheet.create({
  rack: {
    width: '100%',
    paddingHorizontal: PAD,
    paddingTop: PAD,
    paddingBottom: PAD,
    gap: ROW_GAP,
    borderRadius: 10,
    backgroundColor: colors.rack,
    borderBottomWidth: 6,
    borderBottomColor: colors.rackEdge,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  run: { flexDirection: 'row' },
  bar: { height: BAR, marginTop: 2, marginHorizontal: 2, borderRadius: 2 },
  barMeld: { backgroundColor: colors.meld },
  empty: { borderRadius: 6 },
  emptyActive: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.tile },
  dragging: { zIndex: 10, elevation: 10, opacity: 0.9 },
  liftedRow: { zIndex: 10, elevation: 10 },
});
