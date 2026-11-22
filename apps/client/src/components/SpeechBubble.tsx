import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BUBBLE_MS, isEmoji } from '@/online/tableChat';
import { colors } from '@/theme';

type Props = {
  text: string;
  /** Below the panel (for players along the top of the screen) rather than above it. */
  below?: boolean;
};

/**
 * What a player just said, popping up over their place at the table for a few seconds.
 * Give it the line's id as its key: a new line shows a new bubble.
 */
export function SpeechBubble({ text, below }: Props) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setShown(false), BUBBLE_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!shown) return null;
  const emoji = isEmoji(text);
  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, below ? styles.below : styles.above]}
      testID="speech"
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.bubble, emoji && styles.bubbleEmoji]}>
        <Text style={[styles.text, emoji && styles.emoji]} numberOfLines={2}>
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: -20, right: -20, alignItems: 'center', zIndex: 40, elevation: 40 },
  above: { bottom: '100%', marginBottom: 6 },
  below: { top: '100%', marginTop: 6 },
  bubble: {
    maxWidth: 220,
    backgroundColor: colors.tile,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 2,
    borderColor: colors.accent,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  bubbleEmoji: { paddingVertical: 2, paddingHorizontal: 8 },
  text: { color: '#1B1B1B', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  emoji: { fontSize: 28, lineHeight: 34 },
});
