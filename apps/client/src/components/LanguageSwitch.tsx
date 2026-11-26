import { Pressable, StyleSheet, Text } from 'react-native';
import { setLanguage, useLanguage, useT } from '@/i18n';
import { colors } from '@/theme';

/**
 * Switches between English and Albanian. It shows the other language's own name ("Shqip" on
 * the English app, "English" on the Albanian one), so a player who can't read the current
 * language still finds theirs. The choice is remembered on the device.
 */
export function LanguageSwitch() {
  const t = useT();
  const other = useLanguage() === 'en' ? 'sq' : 'en';
  const name = t.language.names[other];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.language.choose(name)}
      onPress={() => setLanguage(other)}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      testID="language-switch"
    >
      <Text style={styles.text}>{name}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.textMuted,
    opacity: 0.9,
  },
  text: { color: colors.text, fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.6 },
});
