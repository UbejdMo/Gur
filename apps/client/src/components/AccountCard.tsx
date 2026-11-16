import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { account, useAccount } from '@/account';
import { colors } from '@/theme';

/** Where the player comes back to after signing in with Google: this page, without its query. */
function returnAddress(): string {
  if (typeof window === 'undefined' || !window.location) return '';
  return window.location.origin + window.location.pathname;
}

/**
 * Your account on the home screen: sign in with Google, or, once signed in, your picture,
 * your name (which you can change) and the id friends can add you by.
 * Shows nothing in a build without accounts.
 */
export function AccountCard() {
  const { available, status, profile } = useAccount();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Coming back from Google, the address carries a one-time code. Once the sign-in has been
  // picked up it is of no use, and the router would otherwise keep showing it.
  const settled = available && status !== 'starting';
  useEffect(() => {
    if (settled && Platform.OS === 'web' && new URLSearchParams(window.location.search).has('code')) {
      router.setParams({ code: undefined });
    }
  }, [settled]);

  if (!settled) return null;

  if (status === 'signedOut' || !profile) {
    const signIn = async () => {
      setBusy(true);
      setError(await account.signIn(returnAddress()));
      setBusy(false);
    };
    return (
      <View style={styles.card} testID="account">
        <Pressable
          accessibilityRole="button"
          onPress={() => void signIn()}
          style={({ pressed }) => [styles.google, busy && styles.dim, pressed && styles.pressed]}
        >
          <Text style={styles.googleText}>Sign in with Google</Text>
        </Pressable>
        <Text style={styles.hint}>Keep your name and picture wherever you play. You can also play as a guest.</Text>
        {error && (
          <Text style={styles.error} testID="account-error">
            {error}
          </Text>
        )}
      </View>
    );
  }

  const save = async () => {
    setBusy(true);
    const problem = await account.rename(name);
    setBusy(false);
    setError(problem);
    if (!problem) setEditing(false);
  };

  return (
    <View style={styles.card} testID="account">
      <View style={styles.who}>
        {profile.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.avatar, styles.avatarBlank]}>
            <Text style={styles.initial}>{profile.username.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.names}>
          <Text style={styles.username} numberOfLines={1} testID="account-name">
            {profile.username}
          </Text>
          <Text style={styles.id} testID="account-id" selectable>
            ID {profile.publicId}
          </Text>
        </View>
      </View>

      {editing ? (
        <>
          <TextInput
            accessibilityLabel="New name"
            value={name}
            onChangeText={setName}
            maxLength={16}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            onSubmitEditing={() => void save()}
          />
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void save()}
              style={[styles.small, styles.smallOn, busy && styles.dim]}
            >
              <Text style={styles.smallOnText}>Save</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setEditing(false);
                setError(null);
              }}
              style={styles.small}
            >
              <Text style={styles.smallText}>Cancel</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setName(profile.username);
              setEditing(true);
            }}
            style={styles.small}
          >
            <Text style={styles.smallText}>Change name</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => void account.signOut()} style={styles.small}>
            <Text style={styles.smallText}>Sign out</Text>
          </Pressable>
        </View>
      )}
      {error && (
        <Text style={styles.error} testID="account-error">
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: 380, backgroundColor: colors.tableDark, borderRadius: 14, padding: 14, gap: 10 },
  google: { backgroundColor: colors.card, paddingVertical: 12, borderRadius: 24, alignItems: 'center' },
  googleText: { fontSize: 16, fontWeight: '800', color: colors.cardText },
  hint: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 14 },
  avatarBlank: { backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.text, fontSize: 20, fontWeight: '800' },
  names: { flex: 1, gap: 2 },
  username: { color: colors.text, fontSize: 18, fontWeight: '800' },
  id: { color: colors.textMuted, fontSize: 13, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', gap: 8 },
  small: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, borderWidth: 2, borderColor: colors.textMuted },
  smallText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  smallOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  smallOnText: { color: '#2A2A2A', fontSize: 13, fontWeight: '800' },
  input: {
    backgroundColor: colors.tile,
    color: '#1B1B1B',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '700',
  },
  error: { color: colors.danger, fontSize: 13 },
  dim: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
});
