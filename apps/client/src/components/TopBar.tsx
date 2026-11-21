import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { account, friends, useAccount, useFriends, useMessages } from '@/account';
import { Avatar } from './Avatar';
import { FriendsPanel } from './FriendsPanel';
import { FullscreenButton } from './FullscreenButton';
import { ChatIcon, FriendsIcon } from './icons';
import { MessagesPanel } from './MessagesPanel';
import type { Other } from './MessagesPanel';
import { Popover } from './Popover';
import { ProfilePanel } from './ProfilePanel';
import { colors } from '@/theme';

/** Where the player comes back to after signing in with Google: this page, without its query. */
function returnAddress(): string {
  if (typeof window === 'undefined' || !window.location) return '';
  return window.location.origin + window.location.pathname;
}

type Open = 'profile' | 'friends' | 'messages' | null;

/**
 * The bar at the top of the first screen. On the left, full screen (where the browser can).
 * On the right: signed out, "Sign in with Google"; signed in, messages, friends (with the
 * number of requests waiting) and your picture, each opening its panel.
 * Without accounts in this build, the right side stays empty.
 */
export function TopBar() {
  const { available, status, profile } = useAccount();
  const asking = useFriends().people.filter((p) => p.state === 'incoming').length;
  const { unread } = useMessages();
  /** The conversation the messages panel opens on, when it was opened from a friend. */
  const [chatWith, setChatWith] = useState<Other | null>(null);
  const [chosen, setOpen] = useState<Open>(null);
  // Signed out (or the account deleted) from inside a panel: the panel has nothing left to show.
  const open = profile ? chosen : null;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean; id: string } | null>(null);

  // Coming back from Google, the address carries a one-time code. Once the sign-in has been
  // picked up it is of no use, and the router would otherwise keep showing it.
  const settled = available && status !== 'starting';
  useEffect(() => {
    if (settled && Platform.OS === 'web' && new URLSearchParams(window.location.search).has('code')) {
      router.setParams({ code: undefined });
    }
  }, [settled]);
  const signIn = async () => {
    setNotice(null);
    setOpen(null);
    setBusy(true);
    const problem = await account.signIn(returnAddress());
    setBusy(false);
    if (problem) setNotice({ text: problem, error: true, id: 'account-error' });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <FullscreenButton compact />
        <View style={styles.right}>
          {settled && profile && (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={unread ? `Messages, ${unread} unread` : 'Messages'}
                onPress={() => {
                  setChatWith(null);
                  setOpen('messages');
                }}
                style={({ pressed }) => [styles.icon, pressed && styles.pressed]}
              >
                <ChatIcon size={22} />
                {unread > 0 && (
                  <View style={styles.badge} testID="unread-badge">
                    <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                  </View>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={asking ? `Friends, ${asking} ${asking === 1 ? 'request' : 'requests'}` : 'Friends'}
                onPress={() => {
                  setOpen('friends');
                  // Look for news at once: a request or an answer may have come since the last check.
                  void friends.refresh();
                }}
                style={({ pressed }) => [styles.icon, pressed && styles.pressed]}
              >
                <FriendsIcon size={22} />
                {asking > 0 && (
                  <View style={styles.badge} testID="requests-badge">
                    <Text style={styles.badgeText}>{asking}</Text>
                  </View>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Your profile"
                onPress={() => setOpen('profile')}
                style={({ pressed }) => [styles.me, pressed && styles.pressed]}
              >
                <Avatar name={profile.username} url={profile.avatarUrl} size={40} testID="profile-picture" />
              </Pressable>
            </>
          )}
          {settled && !profile && (
            <Pressable
              accessibilityRole="button"
              onPress={() => void signIn()}
              style={({ pressed }) => [styles.signIn, busy && styles.dim, pressed && styles.pressed]}
            >
              <Text style={styles.signInText}>Sign in with Google</Text>
            </Pressable>
          )}
        </View>
      </View>
      {notice && (
        <Text style={[styles.notice, notice.error && styles.noticeError]} testID={notice.id}>
          {notice.text}
        </Text>
      )}

      {profile && (
        <>
          <Popover title="Profile" open={open === 'profile'} onClose={() => setOpen(null)} testID="profile-panel">
            <ProfilePanel
              profile={profile}
              onDeleted={() => {
                setOpen(null);
                setNotice({
                  text: 'Your account is deleted. You can keep playing as a guest.',
                  error: false,
                  id: 'account-deleted',
                });
              }}
            />
          </Popover>
          <Popover title="Friends" open={open === 'friends'} onClose={() => setOpen(null)} testID="friends-panel">
            <FriendsPanel
              profile={profile}
              onMessage={(friend) => {
                setChatWith(friend);
                setOpen('messages');
              }}
            />
          </Popover>
          <Popover title="Messages" open={open === 'messages'} onClose={() => setOpen(null)}>
            <MessagesPanel start={chatWith} />
          </Popover>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 6 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.tableDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  me: { borderRadius: 14, borderWidth: 2, borderColor: colors.accent, padding: 1 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.jokerBox,
    borderWidth: 2,
    borderColor: colors.table,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  signIn: { backgroundColor: colors.card, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 22 },
  signInText: { fontSize: 14, fontWeight: '800', color: colors.cardText },
  notice: { color: colors.textMuted, fontSize: 13, textAlign: 'right' },
  noticeError: { color: colors.danger },
  dim: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
