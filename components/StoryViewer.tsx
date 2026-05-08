import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeOut, useSharedValue } from 'react-native-reanimated';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

import type { ViewerItem } from '@/utils/viewerUtils';


const { width, height } = Dimensions.get('window');

export type StoryViewerProps = {
  items: ViewerItem[];
  initialIndex: number;
  onClose: () => void;
};

export function StoryViewer({ items, initialIndex, onClose }: StoryViewerProps) {
  const [index, setIndex] = useState(() => Math.max(0, Math.min(initialIndex, items.length - 1)));
  const [loading, setLoading] = useState(true);

  const current = items[index];

  useEffect(() => {
    setLoading(true);
    // auto-advance: images only for now.
    const ms = current?.kind === 'video' ? 5000 : 5000;
    const t = setTimeout(() => {
      setIndex((prev) => {
        if (prev + 1 >= items.length) return prev;
        return prev + 1;
      });
    }, ms);
    return () => clearTimeout(t);
  }, [index, current?.kind, items.length]);

  const go = (dir: -1 | 1) => {
    setIndex((prev) => {
      const next = prev + dir;
      if (next < 0 || next >= items.length) return prev;
      return next;
    });
  };

  const zoomScale = useSharedValue(1);
  const dragY = useSharedValue(0);

  const swipeDown = Gesture.Pan()
    .onUpdate((e) => {
      if (zoomScale.value <= 1.02 && e.translationY > 0) {
        dragY.value = Math.min(e.translationY, 180);
      }
    })
    .onEnd((e) => {
      if (zoomScale.value <= 1.02 && e.translationY > 120) {
        onClose();
        dragY.value = 0;
      } else {
        dragY.value = 0;
      }
    });

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = zoomScale.value * (e.scale || 1);
      zoomScale.value = Math.max(0.95, Math.min(2.5, next));
    })
    .onEnd(() => {
      if (zoomScale.value < 1.05) zoomScale.value = 1;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(250)
    .onEnd(() => {
      zoomScale.value = 1;
    });

  const gesture = useMemo(
    () => Gesture.Simultaneous(swipeDown, pinch, doubleTap),
    [onClose, items.length]
  );



  return (
    <View style={styles.root}>
      <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)} style={styles.backdrop}>
        <BlurView intensity={65} tint="dark" style={StyleSheet.absoluteFillObject} />
      </Animated.View>

      <GestureDetector gesture={gesture}>
        <View style={styles.content}>
          {/* Progress bars placeholder */}
          <View style={styles.progressRow}>
            {items.map((_, i) => (
              <View
                key={i}
                style={[styles.progressBar, i === index && styles.progressActive]}
              />
            ))}
          </View>

          <View style={styles.mediaArea}>
            {/* Image/video render placeholder (video wired in next pass) */}
            {current?.kind === 'image' ? (
              <View style={[styles.media, { backgroundColor: '#10101B' }]}
                onTouchStart={() => {
                  // keep
                }}
              >
                <Text style={styles.mediaText}>Story media</Text>
              </View>
            ) : (
              <View style={[styles.media, { backgroundColor: '#0b0b14' }]}>
                <Text style={styles.mediaText}>Video story</Text>
              </View>
            )}

            {loading && (
              <View style={styles.loader}>
                <ActivityIndicator size="large" color="#00BCD4" />
              </View>
            )}
          </View>

          <View style={styles.tapZones}>
            <Pressable style={styles.leftZone} onPress={() => go(-1)} />
            <Pressable style={styles.rightZone} onPress={() => go(1)} />
          </View>

          <View style={styles.topRight}>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.bottomControls}>
            <Pressable style={styles.muteBtn} onPress={() => {}}>
              <Ionicons name="volume-off" size={18} color="#fff" />
              <Text style={styles.muteText}>Mute</Text>
            </Pressable>
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject },
  backdrop: { ...StyleSheet.absoluteFillObject },
  content: { flex: 1, paddingTop: 18 },
  progressRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, marginBottom: 10 },
  progressBar: { flex: 1, height: 3, backgroundColor: '#ffffff22', borderRadius: 999 },
  progressActive: { backgroundColor: '#E040FB' },

  mediaArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  media: { width, height: '80%', borderRadius: 18, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  mediaText: { color: '#fff', fontWeight: '800' },

  loader: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },

  tapZones: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row' },
  leftZone: { flex: 1 },
  rightZone: { flex: 1 },

  topRight: { position: 'absolute', right: 14, top: 12 },
  closeBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#0F0F1A80', borderWidth: 1, borderColor: '#2A2A4044', alignItems: 'center', justifyContent: 'center' },

  bottomControls: { position: 'absolute', bottom: 24, width: '100%', paddingHorizontal: 16 },
  muteBtn: { flexDirection: 'row', alignSelf: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999, backgroundColor: '#0F0F1A80', borderWidth: 1, borderColor: '#2A2A4044' },
  muteText: { color: '#fff', fontWeight: '800' },
});

