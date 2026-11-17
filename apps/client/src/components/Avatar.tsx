import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';

type Props = {
  name: string;
  url: string | null;
  size?: number;
  /** The colour behind the letter when there is no picture. */
  color?: string;
  testID?: string;
};

/**
 * A player's picture. Without one, or when it cannot be loaded (a picture Google no longer
 * serves, a blocked address), the first letter of their name instead.
 */
export function Avatar({ name, url, size = 40, color = colors.selected, testID }: Props) {
  const [broken, setBroken] = useState<string | null>(null);
  const box = { width: size, height: size, borderRadius: size * 0.3 };
  if (url && broken !== url) {
    return (
      <Image
        source={{ uri: url }}
        style={box}
        testID={testID}
        onError={() => setBroken(url)}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View style={[box, styles.blank, { backgroundColor: color }]}>
      <Text style={[styles.initial, { fontSize: size * 0.44 }]}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  blank: { alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.text, fontWeight: '800' },
});
