import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { tileId } from '@gur/engine';
import { Tile } from '@/components/Tile';
import { colors } from '@/theme';

const DECOR = [tileId('red', 7), tileId('yellow', 8), tileId('blue', 9), 104];

export default function Home() {
  const [aceHigh, setAceHigh] = useState(true);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title} accessibilityRole="header">
        Gur
      </Text>
      <Text style={styles.subtitle}>Tile rummy, the Kosovo way</Text>

      <View style={styles.decor}>
        {DECOR.map((id) => (
          <Tile key={id} id={id} />
        ))}
      </View>

      <View style={styles.option}>
        <View style={styles.optionText}>
          <Text style={styles.optionTitle}>Allow 12-13-1</Text>
          <Text style={styles.optionHint}>Some areas count 12, 13, 1 as a run. 13-1-2 never counts.</Text>
        </View>
        <Switch
          accessibilityLabel="Allow 12-13-1"
          value={aceHigh}
          onValueChange={setAceHigh}
          trackColor={{ true: colors.accent, false: colors.tableDark }}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(`/play?aceHigh=${aceHigh ? 1 : 0}`)}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>Play against bots</Text>
      </Pressable>

      <Text style={styles.note}>Playing with friends and online is coming next.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.table },
  content: { alignItems: 'center', padding: 24, gap: 20 },
  title: { fontSize: 56, fontWeight: '900', color: colors.text, letterSpacing: 2, marginTop: 40 },
  subtitle: { fontSize: 16, color: colors.textMuted, marginTop: -12 },
  decor: { flexDirection: 'row', gap: 6, marginVertical: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.tableDark,
    borderRadius: 12,
    padding: 14,
    width: '100%',
    maxWidth: 360,
  },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  optionHint: { color: colors.textMuted, fontSize: 12 },
  button: { backgroundColor: colors.accent, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 28 },
  buttonPressed: { opacity: 0.8 },
  buttonText: { fontSize: 17, fontWeight: '800', color: '#2A2A2A' },
  note: { fontSize: 13, color: colors.textMuted, textAlign: 'center', maxWidth: 320 },
});
