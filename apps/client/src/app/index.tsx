import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { describeTile, isRealJoker } from '@gur/engine';
import { Tile } from '@/components/Tile';
import { dealPractice } from '@/practice';
import { colors } from '@/theme';

export default function Home() {
  const [deal, setDeal] = useState(() => dealPractice());
  const { round } = deal.game;
  const jokerName = `${round.joker.color} ${round.joker.number}`;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title} accessibilityRole="header">
        Gur
      </Text>
      <Text style={styles.subtitle}>Tile rummy, the Kosovo way</Text>

      <View style={styles.middle}>
        <View style={styles.middleItem}>
          <Text style={styles.label}>Indicator</Text>
          <Tile id={round.indicator} size="small" />
        </View>
        <View style={styles.middleItem}>
          <Text style={styles.label}>Joker</Text>
          <Text style={styles.joker} testID="joker">
            {jokerName}
          </Text>
        </View>
        <View style={styles.middleItem}>
          <Text style={styles.label}>Middle</Text>
          <Text style={styles.joker} testID="middle-count">
            {round.middle.length}
          </Text>
        </View>
      </View>

      <Text style={styles.label}>Your tiles ({deal.hand.length})</Text>
      <View style={styles.rack} accessibilityLabel={`Your rack: ${deal.hand.map(describeTile).join(', ')}`}>
        {deal.hand.map((id) => (
          <Tile key={id} id={id} wild={isRealJoker(id, round.joker)} />
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => setDeal(dealPractice())}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>Deal again</Text>
      </Pressable>

      <Text style={styles.note}>Practice deal. Games against bots and friends are coming next.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.table },
  content: { alignItems: 'center', padding: 24, gap: 16 },
  title: { fontSize: 48, fontWeight: '900', color: colors.text, letterSpacing: 2, marginTop: 24 },
  subtitle: { fontSize: 16, color: colors.textMuted, marginTop: -8 },
  middle: {
    flexDirection: 'row',
    gap: 24,
    backgroundColor: colors.tableDark,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  middleItem: { alignItems: 'center', gap: 6, minWidth: 64 },
  label: { fontSize: 13, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  joker: { fontSize: 18, color: colors.text, fontWeight: '700', textTransform: 'capitalize' },
  rack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
    maxWidth: 360,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.rack,
    borderBottomWidth: 6,
    borderBottomColor: colors.rackEdge,
  },
  button: { backgroundColor: colors.accent, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 24 },
  buttonPressed: { opacity: 0.8 },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#2A2A2A' },
  note: { fontSize: 13, color: colors.textMuted, textAlign: 'center', maxWidth: 320 },
});
