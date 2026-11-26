import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { MAX_BOT_SECONDS, MIN_BOT_SECONDS } from '@/game/botSettings';
import type { BotSettings } from '@/game/botSettings';
import { colors, tileInk } from '@/theme';
import { useT } from '@/i18n';

type Props = {
  initial: BotSettings;
  onStart: (settings: BotSettings) => void;
};

const SECONDS = Array.from({ length: MAX_BOT_SECONDS - MIN_BOT_SECONDS + 1 }, (_, i) => MIN_BOT_SECONDS + i);

/** The options before a game against bots: 12-13-1, and how long each bot takes over its turn. */
export function BotsSetup({ initial, onStart }: Props) {
  const t = useT();
  const [aceHigh, setAceHigh] = useState(initial.aceHigh);
  const [seconds, setSeconds] = useState(initial.seconds);
  return (
    <View style={styles.box} testID="bots-setup">
      <View style={styles.option}>
        <View style={styles.optionText}>
          <Text style={styles.optionTitle}>{t.common.allowAceHigh}</Text>
          <Text style={styles.hint}>{t.common.aceHighHint}</Text>
        </View>
        <Switch
          accessibilityLabel={t.common.allowAceHigh}
          value={aceHigh}
          onValueChange={setAceHigh}
          trackColor={{ true: colors.accent, false: colors.table }}
        />
      </View>

      <View style={styles.optionColumn}>
        <Text style={styles.optionTitle}>{t.botsSetup.time}</Text>
        <Text style={styles.hint}>
          {t.botsSetup.timeBefore}
          <Text style={styles.strong}>{t.common.seconds(seconds)}</Text>
          {t.botsSetup.timeAfter}
        </Text>
        <View style={styles.seconds} accessibilityRole="radiogroup" accessibilityLabel={t.botsSetup.secondsPerTurn}>
          {SECONDS.map((n) => {
            const on = n === seconds;
            return (
              <Pressable
                key={n}
                accessibilityRole="radio"
                accessibilityLabel={t.common.seconds(n)}
                accessibilityState={{ checked: on }}
                aria-checked={on}
                onPress={() => setSeconds(n)}
                style={[styles.second, on && styles.secondOn]}
              >
                <Text style={[styles.secondText, { color: on ? tileInk.red : tileInk.black }]}>{n}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => onStart({ aceHigh, seconds })}
        style={({ pressed }) => [styles.start, pressed && styles.pressed]}
      >
        <Text style={styles.startText}>{t.common.startGame}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 18 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionColumn: { gap: 6 },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  strong: { color: colors.text, fontWeight: '800' },
  // The seconds are little stones: the one picked is lifted, with a yellow edge.
  seconds: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  second: {
    width: 30,
    height: 40,
    borderRadius: 6,
    backgroundColor: colors.tileBack,
    borderWidth: 1,
    borderColor: colors.tileEdge,
    borderBottomWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondOn: {
    backgroundColor: colors.tile,
    borderColor: colors.accent,
    borderWidth: 2,
    transform: [{ translateY: -4 }],
  },
  secondText: { fontSize: 16, fontWeight: '900' },
  start: { backgroundColor: colors.accent, paddingVertical: 14, borderRadius: 26, alignItems: 'center' },
  startText: { fontSize: 17, fontWeight: '800', color: '#2A2A2A' },
  pressed: { opacity: 0.8 },
});
