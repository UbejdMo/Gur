import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { Ack } from '@gur/server/protocol';
import { colors } from '@/theme';

type Props = {
  /** A signed-in player's name; null for a guest, who types one. */
  username: string | null;
  initialName: string;
  initialAceHigh: boolean;
  onFind: (name: string, aceHigh: boolean) => Promise<Ack>;
};

/**
 * Before Play online: the name a guest plays under, and 12-13-1. Players are only matched with
 * players who made the same choice.
 */
export function OnlineSetup({ username, initialName, initialAceHigh, onFind }: Props) {
  const [typed, setTyped] = useState(initialName);
  const [aceHigh, setAceHigh] = useState(initialAceHigh);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = username ?? typed;

  // The free server sleeps when nobody plays; say so when an answer is taking long.
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => setSlow(true), 4000);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [busy]);

  const find = async () => {
    if (busy) return;
    if (!name.trim()) return setError('Please choose a name');
    setError(null);
    setBusy(true);
    const answer = await onFind(name, aceHigh);
    setBusy(false);
    if (!answer.ok) setError(answer.error);
  };

  return (
    <View style={styles.box} testID="online-setup">
      <Text style={styles.hint}>
        You sit at a table with up to three other players, and only people play: no bots. The game starts with at least
        two players. One round.
      </Text>
      {username ? (
        <View style={styles.optionColumn}>
          <Text style={styles.label}>Playing as</Text>
          <Text style={styles.optionTitle} testID="online-playing-as">
            {username}
          </Text>
        </View>
      ) : (
        <View style={styles.optionColumn}>
          <Text style={styles.label}>Your name</Text>
          <TextInput
            accessibilityLabel="Your name"
            value={typed}
            onChangeText={setTyped}
            maxLength={16}
            autoCapitalize="words"
            autoCorrect={false}
            placeholder="Name"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            onSubmitEditing={() => void find()}
          />
        </View>
      )}
      <View style={styles.option}>
        <View style={styles.optionText}>
          <Text style={styles.optionTitle}>Allow 12-13-1</Text>
          <Text style={styles.hint}>You only meet players who chose the same.</Text>
        </View>
        <Switch
          accessibilityLabel="Allow 12-13-1"
          value={aceHigh}
          onValueChange={setAceHigh}
          trackColor={{ true: colors.accent, false: colors.table }}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Find players"
        onPress={() => void find()}
        style={({ pressed }) => [styles.start, busy && styles.dim, pressed && styles.pressed]}
      >
        <Text style={styles.startText}>{busy ? 'Finding a table…' : 'Find players'}</Text>
      </Pressable>
      {slow && (
        <Text style={styles.hint} testID="online-waking">
          Waking up the game server. This can take up to a minute when nobody has played for a while.
        </Text>
      )}
      {error && (
        <Text style={styles.error} testID="online-error">
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 16 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionColumn: { gap: 6 },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  input: {
    backgroundColor: colors.tile,
    color: '#1B1B1B',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: '700',
  },
  start: { backgroundColor: colors.accent, paddingVertical: 14, borderRadius: 26, alignItems: 'center' },
  startText: { fontSize: 17, fontWeight: '800', color: '#2A2A2A' },
  dim: { opacity: 0.6 },
  pressed: { opacity: 0.8 },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center' },
});
