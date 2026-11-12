import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';

type Props = {
  name: string;
  tileCount: number;
  points: number;
  isTurn: boolean;
  you?: boolean;
  /** Seconds left on your turn, shown as a bar. */
  secondsLeft?: number | null;
  totalSeconds?: number;
  compact?: boolean;
  /** Smaller side panel for short landscape screens. */
  small?: boolean;
};

const AVATAR_COLORS = ['#2F80ED', '#9B51E0', '#EB5757', '#27AE60'];

/** A player's place at the table: picture, name, tiles held, points, and whose turn it is. */
export function PlayerPanel({
  name,
  tileCount,
  points,
  isTurn,
  you,
  secondsLeft,
  totalSeconds = 15,
  compact,
  small,
}: Props) {
  const color = AVATAR_COLORS[(name.charCodeAt(name.length - 1) || 0) % AVATAR_COLORS.length];
  return (
    <View
      style={[styles.panel, compact && styles.compact, small && styles.small, isTurn && styles.turn]}
      testID={you ? 'seat-you' : 'seat'}
      accessibilityLabel={`${name}, ${tileCount} tiles, ${points} points${isTurn ? ', playing now' : ''}`}
    >
      <View style={[styles.avatar, (compact || small) && styles.avatarCompact, { backgroundColor: color }]}>
        <Text style={[styles.initial, (compact || small) && styles.initialCompact]}>{you ? 'You' : name.at(-1)}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.detail}>
          {tileCount} tiles · {points} pts
        </Text>
        {secondsLeft !== undefined && secondsLeft !== null && (
          <View style={styles.timerTrack}>
            <View
              style={[
                styles.timerFill,
                { width: `${Math.max(0, Math.min(1, secondsLeft / totalSeconds)) * 100}%` },
                secondsLeft <= 3 && styles.timerLow,
              ]}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.backdropPanel,
    borderWidth: 2,
    borderColor: colors.panelEdge,
    minWidth: 150,
  },
  compact: { flexDirection: 'column', gap: 4, padding: 6, minWidth: 0, flex: 1 },
  small: { padding: 6, gap: 8, minWidth: 130 },
  turn: { borderColor: colors.accent },
  avatar: { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  avatarCompact: { width: 34, height: 34, borderRadius: 8 },
  initial: { color: colors.text, fontWeight: '800', fontSize: 16 },
  initialCompact: { fontSize: 13 },
  info: { gap: 2, alignItems: 'flex-start', flexShrink: 1 },
  name: { color: colors.text, fontWeight: '700', fontSize: 14 },
  detail: { color: colors.textMuted, fontSize: 12 },
  timerTrack: {
    height: 5,
    width: 90,
    borderRadius: 3,
    backgroundColor: colors.panelEdge,
    overflow: 'hidden',
    marginTop: 3,
  },
  timerFill: { height: 5, backgroundColor: colors.accent },
  timerLow: { backgroundColor: colors.danger },
});
