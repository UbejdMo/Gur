import { StyleSheet, Text, View } from 'react-native';
import { isRealJoker } from '@gur/engine';
import type { Joker, TileId } from '@gur/engine';
import { DragSource } from './DragSource';
import { avatarColor } from './PlayerPanel';
import { Tile } from './Tile';
import {
  DISCARDS_SHOWN,
  DISCARD_BADGE,
  DISCARD_BADGE_COMPACT,
  discardRowHeight,
  discardRowWidth,
} from '@/game/feltLayout';
import { colors } from '@/theme';

type Props = {
  /** The player whose discards these are. */
  name: string;
  you?: boolean;
  /** This player's discarded tiles still on the table, oldest first. */
  discards: readonly TileId[];
  /** The tile the player to move may still take, when it lies in this row: always the newest one. */
  last: TileId | null;
  /** It is your turn to draw, so you may take that tile. */
  takeable: boolean;
  joker: Joker;
  tileWidth: number;
  /** A narrower name badge, for screens short of width. */
  compact?: boolean;
  onTake: () => void;
  /** The last tile was dragged and let go at this point on the screen. */
  onDropAt: (pageX: number, pageY: number) => void;
  onDragChange?: (dragging: boolean) => void;
};

/**
 * One player's discarded tiles, for everyone to see: their latest six, oldest on the left.
 * Only the newest discard on the whole table can be picked up, only by the next player and
 * only on that turn; after that it is gone for good and stays here, dimmed, so players can
 * see which tiles are out of the game.
 */
export function DiscardRow({
  name,
  you,
  discards,
  last,
  takeable,
  joker,
  tileWidth,
  compact = false,
  onTake,
  onDropAt,
  onDragChange,
}: Props) {
  const shown = discards.slice(-DISCARDS_SHOWN);
  return (
    <View
      style={[styles.wrap, { width: discardRowWidth(tileWidth, compact), height: discardRowHeight(tileWidth) }]}
      testID="discards"
      accessibilityLabel={`Discarded by ${you ? 'you' : name}`}
    >
      <View style={[styles.badge, compact && styles.badgeCompact, { backgroundColor: avatarColor(name) }]}>
        <Text style={[styles.badgeText, compact && styles.badgeTextCompact]} selectable={false}>
          {you ? 'You' : name.at(-1)}
        </Text>
      </View>
      {/* Always six tiles wide, so the table doesn't shift as tiles arrive. */}
      <View style={styles.row}>
        {shown.map((id) =>
          id === last ? (
            <DragSource key={id} enabled={takeable} onTap={onTake} onDrop={onDropAt} onDragChange={onDragChange}>
              <View style={[styles.frame, takeable && styles.takeable]}>
                <Tile
                  id={id}
                  width={tileWidth}
                  testID="last-discard"
                  wild={isRealJoker(id, joker)}
                  onPress={() => takeable && onTake()}
                />
              </View>
            </DragSource>
          ) : (
            <View key={id} style={[styles.frame, styles.gone]}>
              <Tile id={id} width={tileWidth} testID="gone-discard" wild={isRealJoker(id, joker)} />
            </View>
          ),
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badge: {
    width: DISCARD_BADGE,
    paddingVertical: 3,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCompact: { width: DISCARD_BADGE_COMPACT, borderRadius: 4 },
  badgeText: { color: colors.text, fontSize: 10, fontWeight: '800' },
  badgeTextCompact: { fontSize: 8 },
  row: {
    flex: 1,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.feltEdge,
  },
  frame: { borderRadius: 6, borderWidth: 1, borderColor: 'transparent' },
  takeable: { borderColor: colors.accent, backgroundColor: colors.accent },
  // Tiles that can no longer be picked up.
  gone: { opacity: 0.6 },
});
