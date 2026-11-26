import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { account } from '@/account';
import type { Profile } from '@/account/account';
import { Avatar } from './Avatar';
import { colors } from '@/theme';
import { useT } from '@/i18n';

/** Puts text on the clipboard. False where the browser does not allow it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clipboard) return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type Props = {
  profile: Profile;
  /** The account is gone: the panel closes and the first screen says so. */
  onDeleted: () => void;
};

/**
 * Your profile, under the picture at the top right: your name and the ID friends can add you
 * by (with a copy button), and changing the name, signing out, and deleting the account.
 */
export function ProfilePanel({ profile, onDeleted }: Props) {
  const t = useT();
  const [mode, setMode] = useState<'view' | 'rename' | 'delete'>('view');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean | null>(null);

  const save = async () => {
    setBusy(true);
    const problem = await account.rename(name);
    setBusy(false);
    setError(problem);
    if (!problem) setMode('view');
  };
  const remove = async () => {
    setBusy(true);
    const problem = await account.deleteAccount();
    setBusy(false);
    setError(problem);
    if (problem) setMode('view');
    else onDeleted();
  };

  return (
    <View style={styles.box} testID="account">
      <View style={styles.who}>
        <Avatar name={profile.username} url={profile.avatarUrl} size={56} />
        <View style={styles.names}>
          <Text style={styles.username} numberOfLines={1} testID="account-name">
            {profile.username}
          </Text>
          <View style={styles.idRow}>
            <Text style={styles.id} testID="account-id" selectable>
              ID {profile.publicId}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.profile.copyId}
              onPress={() => void copyText(profile.publicId).then(setCopied)}
              style={({ pressed }) => [styles.copy, pressed && styles.pressed]}
            >
              <Text style={styles.copyText}>{copied ? t.profile.copied : t.profile.copy}</Text>
            </Pressable>
          </View>
          {copied === false && <Text style={styles.hint}>{t.profile.selectToCopy}</Text>}
        </View>
      </View>
      <Text style={styles.hint}>{t.profile.idHint}</Text>

      {mode === 'rename' && (
        <>
          <TextInput
            accessibilityLabel={t.profile.newName}
            value={name}
            onChangeText={setName}
            maxLength={16}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            style={styles.input}
            onSubmitEditing={() => void save()}
          />
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void save()}
              style={[styles.button, styles.buttonOn, busy && styles.dim]}
            >
              <Text style={styles.buttonDarkText}>{t.common.save}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMode('view');
                setError(null);
              }}
              style={styles.button}
            >
              <Text style={styles.buttonText}>{t.common.cancel}</Text>
            </Pressable>
          </View>
        </>
      )}

      {mode === 'delete' && (
        <>
          <Text style={styles.warning} testID="delete-warning">
            {t.profile.deleteAsk}
          </Text>
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void remove()}
              disabled={busy}
              style={[styles.button, styles.buttonDanger, busy && styles.dim]}
            >
              <Text style={styles.buttonDarkText}>{t.profile.deleteForGood}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setMode('view')} style={styles.button}>
              <Text style={styles.buttonText}>{t.profile.keep}</Text>
            </Pressable>
          </View>
        </>
      )}

      {mode === 'view' && (
        <View style={styles.list}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setName(profile.username);
              setError(null);
              setMode('rename');
            }}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <Text style={styles.itemText}>{t.profile.changeName}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => void account.signOut()}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <Text style={styles.itemText}>{t.profile.signOut}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.profile.delete}
            onPress={() => {
              setError(null);
              setMode('delete');
            }}
            style={({ pressed }) => [styles.item, styles.itemLast, pressed && styles.pressed]}
          >
            <Text style={[styles.itemText, styles.itemDanger]}>{t.profile.delete}</Text>
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
  box: { gap: 12 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  names: { flex: 1, gap: 4 },
  username: { color: colors.text, fontSize: 20, fontWeight: '900' },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  id: { color: colors.textMuted, fontSize: 15, fontVariant: ['tabular-nums'], letterSpacing: 1 },
  copy: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.felt },
  copyText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: 12 },
  list: { borderRadius: 12, backgroundColor: colors.table, overflow: 'hidden' },
  item: { paddingVertical: 13, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.tableDark },
  itemLast: { borderBottomWidth: 0 },
  itemText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  itemDanger: { color: colors.danger },
  input: {
    backgroundColor: colors.tile,
    color: '#1B1B1B',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '700',
  },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  button: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.textMuted,
  },
  buttonOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  buttonDanger: { backgroundColor: colors.danger, borderColor: colors.danger },
  buttonText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  buttonDarkText: { color: '#2A2A2A', fontSize: 14, fontWeight: '800' },
  warning: { color: colors.text, fontSize: 14, lineHeight: 20 },
  error: { color: colors.danger, fontSize: 13 },
  dim: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
