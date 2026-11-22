import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { PlayerView } from '@gur/engine';
import { Tile } from './Tile';
import { colors } from '@/theme';

type Props = {
  /** Your view of the game once a round is over. */
  view: PlayerView;
  /** The name shown for each seat. */
  names: readonly string[];
  /** The main button, if you have one: "Play again", "Next round"... */
  primary?: { label: string; onPress: () => void } | null;
  /** A line under the points: what happens next, or who everyone is waiting for. */
  note?: string | null;
  /** The label of the button that leaves the table. */
  menuLabel?: string;
  onMenu: () => void;
};

export function resultTitle(view: PlayerView, names: readonly string[]): string {
  const result = view.results.at(-1)!;
  const you = view.seat;
  if (result.reason === 'stockOut') {
    if (result.winners.length > 1) return 'The middle ran out: shared win';
    return result.winners[0] === you
      ? 'The middle ran out: you win'
      : `The middle ran out: ${names[result.winners[0]!]} wins`;
  }
  const who = result.winners[0] === you ? 'You closed' : `${names[result.winners[0]!]} closed`;
  return result.double ? `${who} with the joker: double!` : `${who}!`;
}

/** Who won the whole match, in words, once its last round is over. */
export function matchTitle(view: PlayerView, names: readonly string[]): string | null {
  if (view.status !== 'matchOver' || view.settings.rounds === 1) return null;
  if (view.matchWinners.length > 1)
    return `The match is shared: ${view.matchWinners.map((s) => names[s]).join(' and ')}`;
  return view.matchWinners[0] === view.seat ? 'You win the match!' : `${names[view.matchWinners[0]!]} wins the match`;
}

/**
 * End of a round: who won, everyone's points (lowest wins), and the winning hand.
 * In a match of several rounds it also shows the running totals.
 */
export function ResultsOverlay({ view, names, primary, note, menuLabel = 'Menu', onMenu }: Props) {
  const result = view.results.at(-1)!;
  const winner = result.winners[0]!;
  const match = view.settings.rounds > 1;
  const order = result.scores
    .map((s, i) => ({ seat: i, score: s, total: view.players[i]!.total }))
    .sort((a, b) => (match ? a.total - b.total : a.score - b.score));
  const overall = matchTitle(view, names);
  // A phone on its side has little height: points on the left, the winning hand on the right,
  // and the buttons always in view under both.
  const screen = useWindowDimensions();
  const low = screen.height < 520 && screen.width > screen.height;

  return (
    <View style={[styles.overlay, low && styles.overlayLow]} testID="results">
      <View style={[styles.card, low && styles.cardLow]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.body, low && styles.bodyLow]}
          testID="results-body"
        >
          <View style={[styles.column, low && styles.columnLow]}>
            <Text style={[styles.title, low && styles.titleLow]} accessibilityRole="header">
              {resultTitle(view, names)}
            </Text>
            {match && (
              <Text style={[styles.round, low && styles.roundLow]} testID="round-count">
                {overall ?? `Round ${view.round.number} of ${view.settings.rounds}`}
              </Text>
            )}

            <View style={styles.table}>
              {match && (
                <View style={styles.row}>
                  <Text style={[styles.name, styles.head]}>Player</Text>
                  <Text style={[styles.score, styles.head]}>Round</Text>
                  <Text style={[styles.score, styles.head]}>Total</Text>
                </View>
              )}
              {order.map(({ seat, score, total }) => (
                <View key={seat} style={styles.row}>
                  <Text style={[styles.name, result.winners.includes(seat) && styles.winner]} numberOfLines={1}>
                    {result.winners.includes(seat) ? '★ ' : ''}
                    {seat === view.seat && names[seat] !== 'You' ? `${names[seat]} (you)` : names[seat]}
                  </Text>
                  <Text style={[styles.score, result.winners.includes(seat) && styles.winner]} testID={`score-${seat}`}>
                    {score}
                  </Text>
                  {match && (
                    <Text style={styles.score} testID={`total-${seat}`}>
                      {total}
                    </Text>
                  )}
                </View>
              ))}
            </View>
            <Text style={styles.hint}>Lowest points win.</Text>
          </View>
          <View style={[styles.column, low && styles.columnLow]}>
            {result.reason === 'close' && (
              <>
                <Text style={[styles.label, low && styles.labelLow]}>{names[winner]}&apos;s hand</Text>
                <View style={styles.hand}>
                  {(view.players[winner]!.groups ?? []).map((g) => (
                    <View key={g.join('-')} style={styles.group}>
                      {g.map((t) => (
                        <Tile key={t} id={t} size="small" />
                      ))}
                    </View>
                  ))}
                </View>
              </>
            )}

            {note && (
              <Text style={styles.note} testID="results-note">
                {note}
              </Text>
            )}
          </View>
        </ScrollView>

        <View style={[styles.buttons, low && styles.buttonsLow]}>
          {primary && (
            <Pressable accessibilityRole="button" onPress={primary.onPress} style={[styles.button, styles.primary]}>
              <Text style={styles.primaryText}>{primary.label}</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" onPress={onMenu} style={styles.button}>
            <Text style={styles.secondaryText}>{menuLabel}</Text>
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
  overlayLow: { padding: 8 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 420,
    maxHeight: '100%',
    gap: 10,
  },
  cardLow: { maxWidth: 820, paddingVertical: 12, paddingHorizontal: 18, gap: 8 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { gap: 10 },
  bodyLow: { flexDirection: 'row', gap: 20 },
  column: { gap: 10 },
  columnLow: { flex: 1, gap: 6 },
  titleLow: { fontSize: 18, textAlign: 'left' },
  roundLow: { textAlign: 'left' },
  title: { fontSize: 20, fontWeight: '800', color: colors.cardText, textAlign: 'center' },
  table: { gap: 6, marginTop: 4 },
  round: { fontSize: 14, fontWeight: '700', color: '#6B7A72', textAlign: 'center', marginTop: -4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 16, color: colors.cardText },
  score: { minWidth: 56, textAlign: 'right', fontSize: 16, color: colors.cardText, fontVariant: ['tabular-nums'] },
  head: { fontSize: 12, color: '#6B7A72', textTransform: 'uppercase', letterSpacing: 1 },
  note: { fontSize: 14, color: colors.cardText, textAlign: 'center', marginTop: 4 },
  winner: { fontWeight: '800' },
  hint: { fontSize: 12, color: '#6B7A72' },
  label: { fontSize: 13, color: '#6B7A72', textTransform: 'uppercase', letterSpacing: 1, marginTop: 6 },
  labelLow: { marginTop: 0 },
  hand: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  group: { flexDirection: 'row', gap: 2 },
  buttons: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 8 },
  buttonsLow: { marginTop: 0 },
  button: { paddingVertical: 10, paddingHorizontal: 22, borderRadius: 22, borderWidth: 1, borderColor: '#C9D3CD' },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  primaryText: { fontWeight: '700', color: '#2A2A2A', fontSize: 16 },
  secondaryText: { fontWeight: '600', color: colors.cardText, fontSize: 16 },
});
