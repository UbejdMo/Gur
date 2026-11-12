/* eslint-disable react-hooks/refs -- whether the press has moved lives in a ref: it is written and
   read only inside touch handlers, which run outside render. */
import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, PanResponder, Platform, StyleSheet } from 'react-native';

type Props = {
  /** Dragging only works while this is true. */
  enabled: boolean;
  /** A press that never moved: the same as pressing what is inside. */
  onTap: () => void;
  /** The drag ended at this point on the screen. */
  onDrop: (pageX: number, pageY: number) => void;
  /** Lets the table lift this part above the rack while the tile is in the air. */
  onDragChange?: (dragging: boolean) => void;
  children: ReactNode;
};

/**
 * Something on the table that can be picked up and dragged onto the rack:
 * the last discarded tile, or the top tile of the middle.
 */
export function DragSource({ enabled, onTap, onDrop, onDragChange, children }: Props) {
  const moved = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [pan] = useState(() => new Animated.ValueXY());

  const responder = useMemo(() => {
    const reset = () => {
      pan.setOffset({ x: 0, y: 0 });
      pan.setValue({ x: 0, y: 0 });
      setDragging(false);
      onDragChange?.(false);
      moved.current = false;
    };
    return PanResponder.create({
      // Take the press from the very start. This is a small thing on a big table: a quick flick
      // of the mouse is off it before the next movement arrives, and a drag that only began on
      // movement would never begin.
      onStartShouldSetPanResponderCapture: () => enabled,
      onPanResponderGrant: () => {
        pan.setOffset({ x: 0, y: 0 });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_e, g) => {
        if (!moved.current && (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6)) {
          moved.current = true;
          setDragging(true);
          onDragChange?.(true);
        }
        if (moved.current) pan.setValue({ x: g.dx, y: g.dy });
      },
      onPanResponderRelease: (_e, g) => {
        const wasDrag = moved.current;
        reset();
        if (wasDrag) onDrop(g.moveX, g.moveY);
        // In a browser the click that follows already presses what is inside.
        else if (Platform.OS !== 'web') onTap();
      },
      onPanResponderTerminate: reset,
    });
  }, [pan, enabled, onTap, onDrop, onDragChange]);

  return (
    <Animated.View
      {...responder.panHandlers}
      style={dragging && [styles.dragging, { transform: pan.getTranslateTransform() }]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // In the air the tile lets the pointer through: letting go must not count as a click on it,
  // which a browser would otherwise send because the tile is still under the pointer.
  dragging: { zIndex: 20, elevation: 20, opacity: 0.9, pointerEvents: 'none' },
});
