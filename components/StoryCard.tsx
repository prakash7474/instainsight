import React, { memo, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

export type StoryCardProps = {
  uri: string;
  size: number;
  onPress: () => void;
  isVideo?: boolean;
};

function useHoverable() {
  const { width } = useWindowDimensions();
  // Heuristic: web/tablet width indicates hover; RN mobile doesn't.
  return Platform.OS === 'web' && width >= 520;
}

export const StoryCard = memo(function StoryCard({ uri, size, onPress, isVideo }: StoryCardProps) {
  const [pressed, setPressed] = useState(false);
  const hoverable = useHoverable();
  const [hovered, setHovered] = useState(false);

  const scale = useMemo(() => {
    if (pressed) return 0.96;
    if (hoverable && hovered) return 1.03;
    return 1;
  }, [pressed, hoverable, hovered]);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={hoverable ? () => setHovered(true) : undefined}
      onHoverOut={hoverable ? () => setHovered(false) : undefined}
      style={({ pressed: rnPressed }) => {
        // RN web reports pressed state; keep it consistent
        const finalPressed = pressed || rnPressed;
        const finalScale = finalPressed ? 0.965 : scale;
        return [
          styles.wrap,
          {
            width: size + 6,
            height: size + 6,
            transform: [{ scale: finalScale }],
          },
        ];
      }}
    >
      <View style={styles.inner}>
        <Image source={{ uri }} style={[styles.thumb, { width: size, height: size }]} resizeMode="cover" />

        {isVideo ? (
          <View style={styles.playOverlay}>
            <View style={styles.playCircle}>
              <Ionicons name="play" size={16} color="#fff" />
            </View>
          </View>
        ) : null}

        <View pointerEvents="none" style={styles.glow} />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    padding: 3,
    backgroundColor: '#13131F',
    borderWidth: 2,
    borderColor: '#E040FB',
    // Shadows
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
    overflow: 'hidden',
  },

  inner: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#0F0F1A',
  },

  thumb: {
    borderRadius: 999,
    backgroundColor: '#13131F',
  },

  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000033',
    alignItems: 'center',
    justifyContent: 'center',
  },

  playCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E040FBcc',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ffffff33',
  },

  glow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
});

