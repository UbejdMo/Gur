import { StyleSheet, Text, View } from 'react-native';
import { ChatIcon } from './icons';
import { colors } from '@/theme';

/** Messages with friends: not built yet, so the panel says what is coming. */
export function MessagesPanel() {
  return (
    <View style={styles.box} testID="messages-soon">
      <ChatIcon size={40} color={colors.textMuted} />
      <Text style={styles.title}>Messages are coming soon</Text>
      <Text style={styles.text}>
        You will be able to chat with your friends here, with ways to report and block anyone who bothers you.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', gap: 10, paddingVertical: 12 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  text: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
