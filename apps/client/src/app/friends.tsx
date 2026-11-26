import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccount } from '@/account';
import { online } from '@/online/connection';
import { colors } from '@/theme';
import { useT } from '@/i18n';

/**
 * Play with friends. First the choice: create a lobby, or join one. Joining then asks for the
 * code. A guest also types the name they play under; a signed-in player plays under their own.
 * `?code=ABCDE` goes straight to joining with the code filled in, so an invitation can be a link.
 */
export default function Friends() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string }>();
  // A signed-in player goes by the name on their profile; a guest types one.
  const { profile } = useAccount();
  const [typed, setName] = useState(() => online.savedName());
  const name = profile?.username ?? typed;
  const [code, setCode] = useState(() => (params.code ?? '').toUpperCase());
  const [step, setStep] = useState<'choose' | 'join'>(() => (params.code ? 'join' : 'choose'));
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
    if (!name.trim()) return setError(t.common.chooseName);
    if (what === 'join' && !code.trim()) return setError(t.friendsScreen.typeCode);
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
        {t.friendsScreen.title}
      </Text>

      {saved && (
        <Pressable accessibilityRole="button" onPress={() => router.replace('/lobby')} style={styles.back}>
          <Text style={styles.primaryText}>{t.friendsScreen.goBack}</Text>
        </Pressable>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>{profile ? t.common.playingAs : t.common.name}</Text>
        {profile ? (
          <Text style={styles.cardTitle} testID="playing-as">
            {profile.username}
          </Text>
        ) : (
          <TextInput
            accessibilityLabel={t.common.name}
            value={typed}
            onChangeText={setName}
            maxLength={16}
            autoCapitalize="words"
            autoCorrect={false}
            placeholder={t.common.namePlaceholder}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
        )}
      </View>

      {step === 'choose' ? (
        <View style={styles.choices}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.friendsScreen.create}
            onPress={() => void go('create')}
            style={({ pressed }) => [styles.choice, busy !== null && styles.dim, pressed && styles.pressed]}
          >
            <Text style={styles.choiceTitle}>
              {busy === 'create' ? t.friendsScreen.creating : t.friendsScreen.create}
            </Text>
            <Text style={styles.choiceHint}>{t.friendsScreen.createHint}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.friendsScreen.join}
            onPress={() => {
              setError(null);
              setStep('join');
            }}
            style={({ pressed }) => [styles.choice, styles.choiceJoin, pressed && styles.pressed]}
          >
            <Text style={styles.choiceTitle}>{t.friendsScreen.join}</Text>
            <Text style={styles.choiceHint}>{t.friendsScreen.joinHint}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t.friendsScreen.join}</Text>
          <TextInput
            accessibilityLabel={t.friendsScreen.codeLabel}
            value={code}
            onChangeText={(text) => setCode(text.toUpperCase())}
            maxLength={8}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus={!params.code}
            placeholder={t.friendsScreen.codePlaceholder}
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.codeInput]}
            onSubmitEditing={() => void go('join')}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => void go('join')}
            style={({ pressed }) => [styles.primary, busy !== null && styles.dim, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>
              {busy === 'join' ? t.friendsScreen.joining : t.friendsScreen.joinButton}
            </Text>
          </Pressable>
        </View>
      )}

      {slow && (
        <Text style={styles.hint} testID="waking">
          {t.common.waking}
        </Text>
      )}
      {error && (
        <Text style={styles.error} testID="friends-error">
          {error}
        </Text>
      )}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setError(null);
          if (step === 'join') setStep('choose');
          else router.replace('/');
        }}
        style={styles.secondary}
      >
        <Text style={styles.secondaryText}>{t.common.back}</Text>
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
  choices: { width: '100%', maxWidth: 380, gap: 14 },
  choice: { backgroundColor: colors.accent, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 18, gap: 4 },
  choiceJoin: { backgroundColor: colors.meld },
  choiceTitle: { color: '#2A2A2A', fontSize: 20, fontWeight: '900' },
  choiceHint: { color: '#3B3B3B', fontSize: 13 },
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
