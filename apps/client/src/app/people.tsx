import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { friends, useAccount, useFriends } from '@/account';
import type { Person } from '@/account/friends';
import { colors } from '@/theme';

/**
 * Your friends: add one by username or ID, answer the requests you got, and see who you are
 * friends with. (Playing with friends by lobby code is the `friends` screen.)
 */
export default function People() {
  const insets = useSafeAreaInsets();
  const { status, profile } = useAccount();
  const { status: listStatus, people } = useFriends();
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  /** The friend the player is being asked "really remove?" about. */
  const [removing, setRemoving] = useState<string | null>(null);

  const add = async () => {
    setBusy(true);
    const answer = await friends.add(who);
    setBusy(false);
    setMessage({ ok: answer.ok, text: answer.message });
    if (answer.ok) setWho('');
  };
  /** Runs a change on one person and shows what went wrong, if anything. */
  const act = async (change: Promise<string | null>) => {
    setRemoving(null);
    const problem = await change;
    setMessage(problem ? { ok: false, text: problem } : null);
  };

  const incoming = people.filter((p) => p.state === 'incoming');
  const mine = people.filter((p) => p.state === 'friend');
  const outgoing = people.filter((p) => p.state === 'outgoing');

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
        Friends
      </Text>

      {!profile ? (
        <Text style={styles.hint} testID="people-guest">
          {status === 'starting' ? 'One moment…' : 'Sign in on the first screen to add friends.'}
        </Text>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.label}>Add a friend</Text>
            <TextInput
              accessibilityLabel="Username or ID"
              value={who}
              onChangeText={setWho}
              maxLength={16}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Username or ID"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              onSubmitEditing={() => void add()}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => void add()}
              disabled={busy}
              style={({ pressed }) => [styles.primary, busy && styles.dim, pressed && styles.pressed]}
            >
              <Text style={styles.primaryText}>Send request</Text>
            </Pressable>
            <Text style={styles.hint}>
              Friends can add you as <Text style={styles.strong}>{profile.username}</Text> or by your ID{' '}
              <Text style={styles.strong} selectable>
                {profile.publicId}
              </Text>
              .
            </Text>
          </View>

          {message && (
            <Text style={message.ok ? styles.good : styles.error} testID="people-message">
              {message.text}
            </Text>
          )}

          {incoming.length > 0 && (
            <View style={styles.card} testID="requests">
              <Text style={styles.label}>Requests</Text>
              {incoming.map((p) => (
                <Row key={p.id} person={p}>
                  <Small label={`Accept ${p.username}`} on onPress={() => void act(friends.accept(p.id))}>
                    Accept
                  </Small>
                  <Small label={`Decline ${p.username}`} onPress={() => void act(friends.remove(p.id))}>
                    Decline
                  </Small>
                </Row>
              ))}
            </View>
          )}

          <View style={styles.card} testID="friends-list">
            <Text style={styles.label}>Your friends</Text>
            {mine.length === 0 && (
              <Text style={styles.empty}>
                {listStatus === 'failed'
                  ? 'Your friends could not be fetched. Check your connection.'
                  : listStatus === 'ready'
                    ? 'Nobody yet. Send a request above.'
                    : 'One moment…'}
              </Text>
            )}
            {mine.map((p) =>
              removing === p.id ? (
                <Row key={p.id} person={p}>
                  <Small label={`Yes, remove ${p.username}`} danger onPress={() => void act(friends.remove(p.id))}>
                    Remove
                  </Small>
                  <Small label={`Keep ${p.username}`} onPress={() => setRemoving(null)}>
                    Keep
                  </Small>
                </Row>
              ) : (
                <Row key={p.id} person={p}>
                  <Small label={`Remove ${p.username}`} quiet onPress={() => setRemoving(p.id)}>
                    Remove
                  </Small>
                </Row>
              ),
            )}
          </View>

          {outgoing.length > 0 && (
            <View style={styles.card} testID="sent">
              <Text style={styles.label}>Waiting for an answer</Text>
              {outgoing.map((p) => (
                <Row key={p.id} person={p}>
                  <Small
                    label={`Take back the request to ${p.username}`}
                    quiet
                    onPress={() => void act(friends.remove(p.id))}
                  >
                    Take back
                  </Small>
                </Row>
              ))}
            </View>
          )}
        </>
      )}

      <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={styles.secondary}>
        <Text style={styles.secondaryText}>Back</Text>
      </Pressable>
    </ScrollView>
  );
}

/** One player: picture, name and ID, with the buttons for them at the end. */
function Row({ person, children }: { person: Person; children: React.ReactNode }) {
  return (
    <View style={styles.row} testID={`person-${person.username}`}>
      {person.avatarUrl ? (
        <Image source={{ uri: person.avatarUrl }} style={styles.avatar} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.avatar, styles.avatarBlank]}>
          <Text style={styles.initial}>{person.username.slice(0, 1).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.names}>
        <Text style={styles.name} numberOfLines={1}>
          {person.username}
        </Text>
        <Text style={styles.id}>ID {person.publicId}</Text>
      </View>
      {children}
    </View>
  );
}

function Small({
  label,
  onPress,
  on,
  danger,
  quiet,
  children,
}: {
  label: string;
  onPress: () => void;
  on?: boolean;
  danger?: boolean;
  quiet?: boolean;
  children: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.small, on && styles.smallOn, danger && styles.smallDanger, quiet && styles.smallQuiet]}
    >
      <Text style={[styles.smallText, (on || danger) && styles.smallDarkText, quiet && styles.smallQuietText]}>
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.table },
  content: { alignItems: 'center', gap: 14 },
  title: { fontSize: 30, fontWeight: '900', color: colors.text, marginTop: 8 },
  card: { width: '100%', maxWidth: 380, backgroundColor: colors.tableDark, borderRadius: 14, padding: 14, gap: 10 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  hint: { color: colors.textMuted, fontSize: 13, textAlign: 'center', maxWidth: 340 },
  strong: { color: colors.text, fontWeight: '800' },
  empty: { color: colors.textMuted, fontSize: 14 },
  input: {
    backgroundColor: colors.tile,
    color: '#1B1B1B',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: '700',
  },
  primary: { backgroundColor: colors.accent, paddingVertical: 12, borderRadius: 24, alignItems: 'center' },
  primaryText: { fontSize: 16, fontWeight: '800', color: '#2A2A2A' },
  secondary: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.textMuted,
  },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 40, height: 40, borderRadius: 12 },
  avatarBlank: { backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.text, fontSize: 17, fontWeight: '800' },
  names: { flex: 1, gap: 1 },
  name: { color: colors.text, fontSize: 16, fontWeight: '800' },
  id: { color: colors.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] },
  small: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 16, borderWidth: 2, borderColor: colors.textMuted },
  smallText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  smallOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  smallDanger: { backgroundColor: colors.danger, borderColor: colors.danger },
  smallDarkText: { color: '#2A2A2A', fontWeight: '800' },
  smallQuiet: { borderColor: 'transparent', paddingHorizontal: 6 },
  smallQuietText: { color: colors.textMuted, textDecorationLine: 'underline' },
  good: { color: colors.meld, fontSize: 14, textAlign: 'center', maxWidth: 340 },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center', maxWidth: 340 },
  dim: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
});
