import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

import type { ViewerItem } from '@/utils/viewerUtils';
import { inferViewerKind } from '@/utils/viewerUtils';

const IMAGE_DURATION_MS = 5000;

export type StoryViewerProps = {
  items: ViewerItem[];
  initialIndex: number;
  onClose: () => void;
};

export function StoryViewer({ items, initialIndex, onClose }: StoryViewerProps) {
  const safeItems = items ?? [];
  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(initialIndex, Math.max(0, safeItems.length - 1)))
  );
  const [loading, setLoading] = useState(true);
  const current = safeItems[index];
  const videoRef = useRef<Video | null>(null);
  const imageTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeKind = current?.kind ?? (current ? inferViewerKind(current.uri) : null);

  const clearImageTimer = useCallback(() => {
    if (imageTimer.current) {
      clearInterval(imageTimer.current);
      imageTimer.current = null;
    }
  }, []);

  const advance = useCallback(() => {
    setIndex((prev) => Math.min(prev + 1, safeItems.length - 1));
  }, [safeItems.length]);

  const retreat = useCallback(() => {
    setIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  // Reset state on index change
  useEffect(() => {
    setLoading(true);
    clearImageTimer();

    if (videoRef.current) {
      videoRef.current.stopAsync();
    }

    if (activeKind === 'image' && index < safeItems.length - 1) {
      imageTimer.current = setInterval(() => {
        runOnJS(advance)();
      }, IMAGE_DURATION_MS);
    }

    return () => clearImageTimer();
  }, [index, activeKind, advance, clearImageTimer]);

  const onVideoStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status?.isLoaded) return;
      const s = status as any;
      if (s.didJustFinish) {
        runOnJS(advance)();
      }
    },
    [advance]
  );

  // Gestures
  const zoomScale = useSharedValue(1);
  const dragY = useSharedValue(0);
  const animScale = useSharedValue(1);
  const gestureActive = useSharedValue(false);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: withTiming(1 - Math.min(1, dragY.value / 240), { duration: 80 }),
  }));

  const swipeDown = Gesture.Pan()
    .minDistance(10)
    .onUpdate((e: any) => {
      if (zoomScale.value <= 1.02 && e.translationY > 0) {
        dragY.value = Math.min(180, e.translationY);
        gestureActive.value = true;
      }
    })
    .onEnd((e: any) => {
      gestureActive.value = false;
      if (zoomScale.value <= 1.02 && e.translationY > 120) {
        animScale.value = withTiming(0.98, { duration: 120 });
        runOnJS(onClose)();
      }
      dragY.value = withTiming(0, { duration: 160 });
      animScale.value = withTiming(1, { duration: 160 });
    });

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      zoomScale.value = Math.max(0.95, Math.min(2.5, zoomScale.value * (e.scale || 1)));
    })
    .onEnd(() => {
      if (zoomScale.value < 1.05) zoomScale.value = withTiming(1, { duration: 120 });
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(250)
    .onEnd(() => {
      zoomScale.value = withTiming(1, { duration: 120 });
    });

  const swipeHorizontal = Gesture.Pan()
    .minDistance(30)
    .onEnd((e: any) => {
      if (zoomScale.value > 1.05) return;
      if (gestureActive.value) return;
      if (Math.abs(e.translationY) > Math.abs(e.translationX)) return;
      if (e.translationX < 0) runOnJS(advance)();
      else runOnJS(retreat)();
    });

  const composedGesture = Gesture.Race(
    Gesture.Simultaneous(swipeDown, pinch),
    doubleTap,
    swipeHorizontal
  );

  if (!safeItems.length) {
    return (
      <View style={styles.root}>
        <View style={[styles.backdrop, { backgroundColor: '#05050A' }]} />
        <View style={styles.emptyState}>
          <Ionicons name="image-outline" size={44} color="#444" />
          <Text style={styles.emptyText}>No stories available</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Animated.View
        style={[styles.backdrop, backdropStyle]}
        entering={FadeIn.duration(120)}
        exiting={FadeOut.duration(120)}
      >
        {Platform.OS === 'web' ? (
          <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={styles.backdropTint} />
        )}
      </Animated.View>

      <GestureDetector gesture={composedGesture}>
        <Animated.View
          style={[
            styles.content,
            {
              transform: [
                { translateY: dragY as any },
                { scale: animScale as any },
              ],
            },
          ]}
        >
          {/* Progress bars */}
          <View style={styles.progressRow}>
            {safeItems.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.progressBar,
                  {
                    backgroundColor: i <= index ? '#E040FB' : '#ffffff22',
                  },
                ]}
              />
            ))}
          </View>

          {/* Media */}
          <View style={styles.mediaArea}>
            {activeKind === 'image' ? (
              <>
                <Image
                  key={current?.uri}
                  source={{ uri: current?.uri }}
                  style={styles.mediaImage}
                  resizeMode="cover"
                  onLoadStart={() => setLoading(true)}
                  onLoadEnd={() => setLoading(false)}
                />
                {loading && (
                  <View style={styles.loader}>
                    <ActivityIndicator size="large" color="#00BCD4" />
                  </View>
                )}
              </>
            ) : (
              <View style={styles.mediaVideoWrap}>
                <Video
                  key={`video-${index}`}
                  ref={videoRef}
                  source={{ uri: current?.uri }}
                  style={styles.mediaImage}
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay
                  isLooping={false}
                  useNativeControls={false}
                  onLoadStart={() => setLoading(true)}
                  onLoad={() => setLoading(false)}
                  onPlaybackStatusUpdate={onVideoStatus}
                />
                {loading && (
                  <View style={styles.loader}>
                    <ActivityIndicator size="large" color="#00BCD4" />
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Tap zones */}
          <View style={styles.tapZones}>
            <Pressable style={styles.leftZone} onPress={retreat} />
            <Pressable style={styles.rightZone} onPress={advance} />
          </View>

          {/* Close */}
          <View style={styles.topRight}>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  backdropTint: { ...StyleSheet.absoluteFillObject, backgroundColor: '#05050A80' },
  content: { flex: 1, paddingTop: 18, overflow: 'hidden' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#888', marginTop: 10, fontWeight: '700' },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  progressBar: {
    flex: 1,
    height: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  mediaArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mediaImage: {
    width: '100%',
    height: '80%',
    borderRadius: 18,
    overflow: 'hidden',
  },
  mediaVideoWrap: { width: '100%', height: '80%', borderRadius: 18, overflow: 'hidden' },
  loader: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tapZones: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  leftZone: { flex: 1 },
  rightZone: { flex: 1 },
  topRight: { position: 'absolute', right: 14, top: 12 },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#0F0F1A80',
    borderWidth: 1,
    borderColor: '#2A2A4044',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
