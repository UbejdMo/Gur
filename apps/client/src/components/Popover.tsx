import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CloseIcon } from './icons';
import { colors } from '@/theme';

type Props = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Where it hangs: under the buttons at the top right (the default), or in the middle of the screen. */
  place?: 'topRight' | 'centre';
  testID?: string;
};

/**
 * A panel over the screen: the profile, friends and messages under their buttons at the top
 * right, or a box in the middle (the bots options). A tap beside it, the close button, or the
 * back button (Escape in a browser) closes it.
 */
export function Popover({ title, open, onClose, children, place = 'topRight', testID }: Props) {
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const width = Math.min(400, screen.width - 24);
  const top = place === 'topRight' ? insets.top + 64 : Math.max(insets.top + 24, screen.height * 0.12);
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" testID="popover-backdrop" />
      <View
        style={[
          styles.panel,
          { width, top, maxHeight: screen.height - top - insets.bottom - 16 },
          place === 'topRight'
            ? // Under the buttons: the first screen's content is at most 960 wide, centred, with 20 to spare.
              { right: Math.max(12 + insets.right, (screen.width - 960) / 2 + 20) }
            : { left: (screen.width - width) / 2 },
        ]}
        accessibilityViewIsModal
        testID={testID}
      >
        <View style={styles.head}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Close ${title.toLowerCase()}`}
            onPress={onClose}
            hitSlop={10}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          >
            <CloseIcon size={16} />
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  panel: {
    position: 'absolute',
    backgroundColor: colors.tableDark,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.felt,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  close: { padding: 6, borderRadius: 14 },
  pressed: { opacity: 0.6 },
  body: { padding: 16, paddingTop: 8, gap: 12 },
});
