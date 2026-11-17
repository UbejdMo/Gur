import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TileId } from '@gur/engine';
import { Tile } from './Tile';
import { colors } from '@/theme';

type Props = {
  title: string;
  subtitle: string;
  /** Three tiles fanned out on the card. */
  tiles: readonly [TileId, TileId, TileId];
  /** How far the card leans, in degrees. */
  tilt: number;
  width: number;
  onPress: () => void;
};

/**
 * One of the two ways into a game on the first screen: a big stone, leaning a little, with
 * three tiles fanned out on it like a hand. Pressed, it straightens up.
 */
export function PlayCard({ title, subtitle, tiles, tilt, width, onPress }: Props) {
  const tile = Math.round(Math.min(46, width * 0.2));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width, transform: [{ rotate: `${pressed ? 0 : tilt}deg` }, { scale: pressed ? 0.97 : 1 }] },
      ]}
    >
      <View style={[styles.fan, { height: tile * 1.4 + 18 }]}>
        {tiles.map((id, i) => (
          <View
            key={id}
            style={{
              marginHorizontal: -tile * 0.08,
              transform: [{ rotate: `${(i - 1) * 14}deg` }, { translateY: i === 1 ? -6 : 4 }],
            }}
          >
            <Tile id={id} width={tile} testID="card-tile" />
          </View>
        ))}
      </View>
      <Text style={[styles.title, width < 170 && styles.titleSmall]}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: 6,
    paddingTop: 18,
    paddingBottom: 20,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: colors.tile,
    borderWidth: 1,
    borderColor: colors.tileEdge,
    // The stone's thickness, like the tiles on a rack.
    borderBottomWidth: 7,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  fan: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { color: colors.cardText, fontSize: 21, fontWeight: '900', textAlign: 'center' },
  titleSmall: { fontSize: 17 },
  subtitle: { color: '#5B6A61', fontSize: 13, textAlign: 'center' },
});
