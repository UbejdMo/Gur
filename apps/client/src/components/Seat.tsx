import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';

type Props = {
  name: string;
  tileCount: number;
  isTurn: boolean;
  score?: number;
};

/** An opponent's place at the table: name, how many tiles they hold, and whose turn it is. */
export function Seat({ name, tileCount, isTurn, score }: Props) {
  return (
    <View
      style={[styles.seat, isTurn && styles.turn]}
      testID="seat"
      accessibilityLabel={`${name}, ${tileCount} tiles${isTurn ? ', playing now' : ''}`}
    >
      <View style={styles.avatar}>
        <Text style={styles.initial}>{name.at(-1)}</Text>
      </View>
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.count}>{tileCount} tiles</Text>
      {score !== undefined && <Text style={styles.count}>{score} pts</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  seat: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.tableDark,
    borderWidth: 2,
    borderColor: 'transparent',
    minWidth: 76,
  },
  turn: { borderColor: colors.accent },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.felt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { color: colors.text, fontWeight: '800', fontSize: 16 },
  name: { color: colors.text, fontWeight: '700', fontSize: 13 },
  count: { color: colors.textMuted, fontSize: 12 },
});
