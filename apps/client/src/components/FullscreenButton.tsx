import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFullscreen } from '@/hooks/useFullscreen';
import { colors } from '@/theme';

type Props = {
  /** A small square with only the icon, for the corner of the table. */
  compact?: boolean;
};

/** Switches the browser to full screen and back. Shows nothing where the browser can't do it. */
export function FullscreenButton({ compact = false }: Props) {
  const { supported, active, toggle } = useFullscreen();
  if (!supported) return null;
  const label = active ? 'Leave full screen' : 'Full screen';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID="fullscreen"
      onPress={toggle}
      style={({ pressed }) => [styles.button, compact && styles.compact, pressed && styles.pressed]}
    >
      {/* Four corner marks, drawn rather than typed: phones don't all have the symbol. */}
      <View style={styles.icon}>
        <View style={[styles.corner, styles.topLeft, active && styles.inward]} />
        <View style={[styles.corner, styles.topRight, active && styles.inward]} />
        <View style={[styles.corner, styles.bottomLeft, active && styles.inward]} />
        <View style={[styles.corner, styles.bottomRight, active && styles.inward]} />
      </View>
      {!compact && <Text style={styles.text}>{label}</Text>}
    </Pressable>
  );
}

const MARK = 6;
const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.textMuted,
  },
  compact: { padding: 5, paddingVertical: 5, paddingHorizontal: 5, borderRadius: 7, borderWidth: 1, opacity: 0.85 },
  pressed: { opacity: 0.6 },
  icon: { width: 16, height: 16 },
  corner: { position: 'absolute', width: MARK, height: MARK, borderColor: colors.text },
  topLeft: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
  topRight: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
  // In full screen the marks close in a little, to read as "smaller".
  inward: { margin: 2 },
  text: { color: colors.text, fontSize: 15, fontWeight: '700' },
});
