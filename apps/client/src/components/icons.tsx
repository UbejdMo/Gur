import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme';

/*
 * Small icons drawn with plain shapes: no icon font to download, and they look the same on
 * every phone. Each fits a square of `size` points.
 */

/** A head and shoulders. */
export function PersonIcon({ size = 22, color = colors.text }: { size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center' }}>
      <View style={{ width: size * 0.42, height: size * 0.42, borderRadius: size, backgroundColor: color }} />
      <View
        style={{
          marginTop: size * 0.08,
          width: size * 0.82,
          height: size * 0.42,
          borderTopLeftRadius: size,
          borderTopRightRadius: size,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** Two people, one behind the other. */
export function FriendsIcon({ size = 22, color = colors.text }: { size?: number; color?: string }) {
  return (
    <View style={{ width: size * 1.2, height: size }}>
      <View style={[StyleSheet.absoluteFill, { left: size * 0.38, opacity: 0.55 }]}>
        <PersonIcon size={size * 0.86} color={color} />
      </View>
      <View style={[StyleSheet.absoluteFill, { top: size * 0.08 }]}>
        <PersonIcon size={size * 0.92} color={color} />
      </View>
    </View>
  );
}

/** A speech bubble. */
export function ChatIcon({ size = 22, color = colors.text }: { size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, justifyContent: 'center' }}>
      <View
        style={{
          width: size,
          height: size * 0.72,
          borderRadius: size * 0.22,
          borderWidth: size * 0.11,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: size * 0.1,
        }}
      >
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ width: size * 0.1, height: size * 0.1, borderRadius: size, backgroundColor: color }} />
        ))}
      </View>
      {/* the tail */}
      <View
        style={{
          position: 'absolute',
          left: size * 0.2,
          bottom: size * 0.04,
          width: size * 0.2,
          height: size * 0.2,
          backgroundColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

/** A cross, for closing. */
export function CloseIcon({ size = 18, color = colors.text }: { size?: number; color?: string }) {
  const bar = {
    position: 'absolute' as const,
    width: size,
    height: size * 0.14,
    borderRadius: size,
    backgroundColor: color,
  };
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[bar, { transform: [{ rotate: '45deg' }] }]} />
      <View style={[bar, { transform: [{ rotate: '-45deg' }] }]} />
    </View>
  );
}
