import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Game } from '@gur/engine';
import { Tile } from './Tile';
import { PLAYER_NAMES, YOU } from '@/game/usePracticeGame';
import { colors } from '@/theme';

type Props = {
  game: Game;
  onPlayAgain: () => void;
  onMenu: () => void;
};

export function resultTitle(game: Game): string {
  const result = game.results.at(-1)!;
  if (result.reason === 'stockOut') {
    if (result.winners.length > 1) return 'The middle ran out: shared win';
    return result.winners[0] === YOU
      ? 'The middle ran out: you win'
      : `The middle ran out: ${PLAYER_NAMES[result.winners[0]!]} wins`;
  }
  const who = result.winners[0] === YOU ? 'You closed' : `${PLAYER_NAMES[result.winners[0]!]} closed`;
  return result.double ? `${who} with the joker: double!` : `${who}!`;
}

/** End of a round: who won, everyone's points (lowest wins), and the winning hand. */
export function ResultsOverlay({ game, onPlayAgain, onMenu }: Props) {
  const result = game.results.at(-1)!;
  const winner = result.winners[0]!;
  const order = result.scores.map((s, i) => ({ seat: i, score: s })).sort((a, b) => a.score - b.score);

  return (
    <View style={styles.overlay} testID="results">
      <View style={styles.card}>
        <Text style={styles.title} accessibilityRole="header">
          {resultTitle(game)}
        </Text>

        <View style={styles.table}>
          {order.map(({ seat, score }) => (
            <View key={seat} style={styles.row}>
              <Text style={[styles.name, result.winners.includes(seat) && styles.winner]}>
                {result.winners.includes(seat) ? '★ ' : ''}
                {PLAYER_NAMES[seat]}
              </Text>
              <Text style={[styles.score, result.winners.includes(seat) && styles.winner]} testID={`score-${seat}`}>
                {score}
              </Text>
            </View>
          ))}
        </View>
        <Text style={styles.hint}>Lowest points win.</Text>

        {result.reason === 'close' && (
          <>
            <Text style={styles.label}>{PLAYER_NAMES[winner]}&apos;s hand</Text>
            <View style={styles.hand}>
              {game.players[winner]!.groups.map((g) => (
                <View key={g.join('-')} style={styles.group}>
                  {g.map((t) => (
                    <Tile key={t} id={t} size="small" />
                  ))}
                </View>
              ))}
            </View>
          </>
        )}

        <View style={styles.buttons}>
          <Pressable accessibilityRole="button" onPress={onPlayAgain} style={[styles.button, styles.primary]}>
            <Text style={styles.primaryText}>Play again</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onMenu} style={styles.button}>
            <Text style={styles.secondaryText}>Menu</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 20, width: '100%', maxWidth: 420, gap: 10 },
  title: { fontSize: 20, fontWeight: '800', color: colors.cardText, textAlign: 'center' },
  table: { gap: 6, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  name: { fontSize: 16, color: colors.cardText },
  score: { fontSize: 16, color: colors.cardText, fontVariant: ['tabular-nums'] },
  winner: { fontWeight: '800' },
  hint: { fontSize: 12, color: '#6B7A72' },
  label: { fontSize: 13, color: '#6B7A72', textTransform: 'uppercase', letterSpacing: 1, marginTop: 6 },
  hand: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  group: { flexDirection: 'row', gap: 2 },
  buttons: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 8 },
  button: { paddingVertical: 10, paddingHorizontal: 22, borderRadius: 22, borderWidth: 1, borderColor: '#C9D3CD' },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  primaryText: { fontWeight: '700', color: '#2A2A2A', fontSize: 16 },
  secondaryText: { fontWeight: '600', color: colors.cardText, fontSize: 16 },
});
