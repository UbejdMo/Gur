import type { ReactNode } from 'react';
import { Linking, Platform, StyleSheet, Text } from 'react-native';
import { colors } from '@/theme';

/** Where the web game lives. The phone apps open the plain pages (privacy, terms) from here. */
export const SITE = 'https://ubejdmo.github.io/Gur/';

/**
 * A link to one of the plain pages that sit next to the web game (`public/privacy.html`,
 * `public/terms.html`). On the web it is a real link, relative to the game's own address, so
 * it also works under /Gur and can be followed by programs that read the page. In the phone
 * apps it opens the page in the browser.
 */
export function PageLink({ page, children }: { page: string; children: ReactNode }) {
  if (Platform.OS === 'web') {
    // react-native-web turns a Text with an href into an <a>; React Native's types don't know that.
    const web = { href: page } as object;
    return (
      <Text accessibilityRole="link" style={styles.link} {...web}>
        {children}
      </Text>
    );
  }
  return (
    <Text accessibilityRole="link" style={styles.link} onPress={() => void Linking.openURL(SITE + page)}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  link: { fontSize: 13, color: colors.accent, fontWeight: '700', textDecorationLine: 'underline' },
});
