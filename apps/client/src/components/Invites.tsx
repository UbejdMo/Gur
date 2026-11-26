import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Invite } from '@gur/server/protocol';
import { messages, useAccount } from '@/account';
import { online } from '@/online/connection';
import { Avatar } from './Avatar';
import { colors } from '@/theme';
import { useT } from '@/i18n';

type Shown = Invite & { until: number; key: number };

/**
 * Keeps the server told whether you are signed in, so friends can invite you and write to
 * you, passes new-message nudges to the messages store, and shows an invitation when one
 * comes: who invites you, Join and Not now, and the seconds left.
 * It sits over every screen, so an invite reaches you wherever you are in the app.
 */
export function Invites() {
  const t = useT();
  const { status, profile } = useAccount();
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<Shown | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    online.setPresent(status === 'signedIn');
  }, [status]);

  // Messages: a nudge from the server fetches what is new; sending a message nudges the friend.
  useEffect(() => {
    messages.setPoke((to) => void online.poke(to));
    return online.onNews((news) => void messages.news(news.with));
  }, []);

  useEffect(
    () =>
      online.onInvite((invite) => {
        // Already in that lobby (from another tab, say): nothing to ask.
        if (online.get().lobby?.code === invite.code) return;
        setProblem(null);
        setShown({ ...invite, until: Date.now() + invite.seconds * 1000, key: Math.random() });
      }),
    [],
  );

  // The countdown, and the invite gone when it runs out.
  useEffect(() => {
    if (!shown) return;
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= shown.until) setShown((s) => (s?.key === shown.key ? null : s));
    }, 250);
    return () => clearInterval(timer);
  }, [shown]);

  if (!shown || !profile) return null;
  const left = Math.max(0, Math.ceil((shown.until - now) / 1000));

  const join = async () => {
    setBusy(true);
    const answer = await online.join(shown.code, profile.username);
    setBusy(false);
    if (!answer.ok) {
      setProblem(answer.error);
      return;
    }
    setShown(null);
    router.push('/lobby');
  };

  return (
    <View
      style={[styles.banner, { top: insets.top + 10, left: insets.left + 12, right: insets.right + 12 }]}
      accessibilityRole="alert"
      testID="invite"
    >
      <View style={styles.row}>
        <Avatar name={shown.from.name} url={shown.from.avatarUrl} size={44} />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={2}>
            {t.invite.incoming(shown.from.name)}
          </Text>
          <Text style={styles.hint} testID="invite-seconds">
            {problem ?? t.invite.incomingLobby(shown.code, left)}
          </Text>
        </View>
      </View>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.invite.joinNamed(shown.from.name)}
          onPress={() => void join()}
          disabled={busy}
          style={({ pressed }) => [styles.join, busy && styles.dim, pressed && styles.pressed]}
        >
          <Text style={styles.joinText}>{t.invite.join}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setShown(null)}
          style={({ pressed }) => [styles.later, pressed && styles.pressed]}
        >
          <Text style={styles.laterText}>{t.invite.notNow}</Text>
        </Pressable>
      </View>
      {/* The time left, as a bar that runs down. */}
      <View style={styles.track}>
        <View style={[styles.bar, { width: `${(100 * Math.max(0, shown.until - now)) / (shown.seconds * 1000)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: 420,
    marginHorizontal: 'auto',
    backgroundColor: colors.tableDark,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.accent,
    padding: 14,
    gap: 12,
    overflow: 'hidden',
    zIndex: 1000,
    elevation: 30,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  text: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: 13 },
  join: { flex: 1, backgroundColor: colors.accent, paddingVertical: 11, borderRadius: 22, alignItems: 'center' },
  joinText: { color: '#2A2A2A', fontSize: 15, fontWeight: '900' },
  later: { paddingVertical: 9, paddingHorizontal: 18, borderRadius: 22, borderWidth: 2, borderColor: colors.textMuted },
  laterText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: colors.table },
  bar: { height: 4, backgroundColor: colors.accent },
  dim: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
});
