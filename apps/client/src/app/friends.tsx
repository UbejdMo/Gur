import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccount } from '@/account';
import { online } from '@/online/connection';
import { colors } from '@/theme';

/**
 * Play with friends: choose a name, then open a lobby or join one with its code.
 * `?code=ABCDE` fills the code in, so an invitation can be a link.
 */
export default function Friends() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string }>();
  // A signed-in player goes by the name on their profile; a guest types one.
  const { profile } = useAccount();
  const [typed, setName] = useState(() => online.savedName());
  const name = profile?.username ?? typed;
  const [code, setCode] = useState(() => (params.code ?? '').toUpperCase());
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A lobby from an earlier visit (the page was closed or reloaded): offer the way back in.
  const [saved] = useState(() => online.hasSavedSession());

  // The free server sleeps when nobody plays; say so when an answer is taking long.
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => setSlow(true), 4000);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [busy]);

  const go = async (what: 'create' | 'join') => {
    if (busy) return;
    if (!name.trim()) return setError('Please choose a name');
    if (what === 'join' && !code.trim()) return setError('Type the code your friend gave you');
    setError(null);
    setBusy(what);
    const answer = what === 'create' ? await online.create(name) : await online.join(code, name);
    setBusy(null);
    if (answer.ok) router.replace('/lobby');
    else setError(answer.error);
  };

  return (
    <ScrollView
      style={styles.screen}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: 24 + insets.top,
          paddingBottom: 24 + insets.bottom,
          paddingLeft: 24 + insets.left,
          paddingRight: 24 + insets.right,
        },
      ]}
    >
      <Text style={styles.title} accessibilityRole="header">
        Play with friends
      </Text>

      {saved && (
        <Pressable accessibilityRole="button" onPress={() => router.replace('/lobby')} style={styles.back}>
          <Text style={styles.primaryText}>Go back to your game</Text>
        </Pressable>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>{profile ? 'Playing as' : 'Your name'}</Text>
        {profile ? (
          <Text style={styles.cardTitle} testID="playing-as">
            {profile.username}
          </Text>
        ) : (
          <TextInput
            accessibilityLabel="Your name"
            value={typed}
            onChangeText={setName}
            maxLength={16}
            autoCapitalize="words"
            autoCorrect={false}
            placeholder="Name"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Start a new lobby</Text>
        <Text style={styles.hint}>You get a code to share. Up to four players.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void go('create')}
          style={({ pressed }) => [styles.primary, busy !== null && styles.dim, pressed && styles.pressed]}
        >
          <Text style={styles.primaryText}>{busy === 'create' ? 'Creating…' : 'Create a lobby'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Join a friend</Text>
        <TextInput
          accessibilityLabel="Lobby code"
          value={code}
          onChangeText={(text) => setCode(text.toUpperCase())}
          maxLength={8}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="CODE"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, styles.codeInput]}
          onSubmitEditing={() => void go('join')}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => void go('join')}
          style={({ pressed }) => [styles.primary, busy !== null && styles.dim, pressed && styles.pressed]}
        >
          <Text style={styles.primaryText}>{busy === 'join' ? 'Joining…' : 'Join'}</Text>
        </Pressable>
      </View>

      {slow && (
        <Text style={styles.hint} testID="waking">
          Waking up the game server. This can take up to a minute when nobody has played for a while.
        </Text>
      )}
      {error && (
        <Text style={styles.error} testID="friends-error">
          {error}
        </Text>
      )}

      <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={styles.secondary}>
        <Text style={styles.secondaryText}>Back</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.table },
  content: { alignItems: 'center', gap: 14 },
  title: { fontSize: 30, fontWeight: '900', color: colors.text, marginTop: 8 },
  card: { width: '100%', maxWidth: 380, backgroundColor: colors.tableDark, borderRadius: 14, padding: 14, gap: 10 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  hint: { color: colors.textMuted, fontSize: 13, textAlign: 'center', maxWidth: 340 },
  input: {
    backgroundColor: colors.tile,
    color: '#1B1B1B',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: '700',
  },
  codeInput: { textAlign: 'center', letterSpacing: 6, fontSize: 24 },
  primary: { backgroundColor: colors.accent, paddingVertical: 12, borderRadius: 24, alignItems: 'center' },
  primaryText: { fontSize: 16, fontWeight: '800', color: '#2A2A2A' },
  back: { backgroundColor: colors.meld, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 24 },
  secondary: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.textMuted,
  },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  dim: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center', maxWidth: 340 },
});
