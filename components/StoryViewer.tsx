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

// const { height } = Dimensions.get('window');

const IMAGE_DURATION_MS = 5000;

export type StoryViewerProps = {
  items: ViewerItem[];
  initialIndex: number;
  onClose: () => void;
};

export function StoryViewer({ items, initialIndex, onClose }: StoryViewerProps) {
  const safeItems = Array.isArray(items) ? items : [];

  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(initialIndex ?? 0, Math.max(0, safeItems.length - 1)))
  );

  const [loading, setLoading] = useState(true);
  const current = safeItems[index];

  const videoRef = useRef<Video | null>(null);

  const [imageProgress, setImageProgress] = useState(0); // 0..1
  const [videoProgress, setVideoProgress] = useState(0); // 0..1

  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeKind = useMemo<ViewerItem['kind'] | null>(() => {
    if (!current) return null;
    return current.kind ?? inferViewerKind(current.uri);
  }, [current]);

  const clearImageProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const advance = useCallback(() => {
    setIndex((prev) => {
      const next = prev + 1;
      if (next >= safeItems.length) return prev;
      return next;
    });
  }, [safeItems.length]);

  const retreat = useCallback(() => {
    setIndex((prev) => {
      const next = prev - 1;
      if (next < 0) return prev;
      return next;
    });
  }, []);

  // Reset per index
  useEffect(() => {
    setLoading(true);
    setImageProgress(0);
    setVideoProgress(0);

    clearImageProgressTimer();

    if (videoRef.current && activeKind === 'video') {
      // best-effort: reset position
      (videoRef.current as any)?.setPositionAsync?.(0);
    }

    if (activeKind === 'image') {
      const start = Date.now();
      progressTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - start;
        const p = Math.max(0, Math.min(1, elapsed / IMAGE_DURATION_MS));
        setImageProgress(p);
        if (p >= 1) {
          clearImageProgressTimer();
          runOnJS(advance)();
        }
      }, 50);
    }

    return () => {
      clearImageProgressTimer();
    };
  }, [index, activeKind, advance, clearImageProgressTimer]);

  const onVideoStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status || typeof status !== 'object') return;
      if (!('isLoaded' in status)) return;
      const loadedStatus = status as any;
      if (!loadedStatus.isLoaded) return;
      if (activeKind !== 'video') return;

      if (typeof loadedStatus.durationMillis === 'number' && loadedStatus.durationMillis > 0) {
        const p = (loadedStatus.positionMillis ?? 0) / loadedStatus.durationMillis;
        setVideoProgress(Math.max(0, Math.min(1, p)));
      }

      if (loadedStatus.didJustFinish) {
        runOnJS(advance)();
      }
    },
    [activeKind, advance]
  );

  // Close gesture (swipe down)
  const zoomScale = useSharedValue(1);
  const dragY = useSharedValue(0);
  const animScale = useSharedValue(1);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: withTiming(1 - Math.min(1, dragY.value / 240), { duration: 80 }),
  }));

  const swipeDown = Gesture.Pan()
    .onUpdate((e) => {
      if (zoomScale.value <= 1.02 && e.translationY > 0) {
        dragY.value = Math.min(180, e.translationY);
      }
    })
    .onEnd((e) => {
      if (zoomScale.value <= 1.02 && e.translationY > 120) {
        animScale.value = withTiming(0.98, { duration: 120 });
        runOnJS(onClose)();
      }
      dragY.value = withTiming(0, { duration: 160 });
      animScale.value = withTiming(1, { duration: 160 });
    });

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = zoomScale.value * (e.scale || 1);
      zoomScale.value = Math.max(0.95, Math.min(2.5, next));
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

  const swipeHorizontal = Gesture.Pan().onEnd((e) => {
    if (zoomScale.value > 1.05) return;

    const absX = Math.abs(e.translationX);
    const absY = Math.abs(e.translationY);

    // Avoid accidental triggers from vertical scroll gestures
    if (absX < 50) return;
    if (absY > 70) return;

    if (e.translationX < 0) advance();
    else retreat();
  });

  const gesture = useMemo(
    () => Gesture.Simultaneous(swipeDown, pinch, doubleTap, swipeHorizontal),
    [advance, retreat, onClose]
  );

  const itemProgress = useMemo(() => {
    return activeKind === 'video' ? videoProgress : imageProgress;
  }, [activeKind, videoProgress, imageProgress]);



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
      {/* Backdrop blur/dim */}
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

      <GestureDetector gesture={gesture}>
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
            {safeItems.map((_, i) => {
              const filled = i < index;
              const active = i === index;

              return (
                <View key={i} style={[styles.progressBar, filled && styles.progressFilledBg]}>
                  {active ? (
                    <View style={[styles.progressFill, { transform: [{ scaleX: itemProgress }] }]} />
                  ) : null}
                </View>
              );
            })}
          </View>

          {/* Media */}
          <View style={styles.mediaArea}>
            {activeKind === 'image' ? (
              <>
                <Image
                  source={{ uri: current.uri }}
                  style={styles.mediaImage}
                  resizeMode="cover"
                  onLoadStart={() => setLoading(true)}
                  onLoadEnd={() => setLoading(false)}
                />
                {loading ? (
                  <View style={styles.loader}>
                    <ActivityIndicator size="large" color="#00BCD4" />
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.mediaVideoWrap}>
                <Video
                  key={current?.uri}
                  ref={(r) => {
                    videoRef.current = r;
                  }}
                  source={{ uri: current?.uri }}
                  style={styles.mediaImage}
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay
                  useNativeControls={false}
                  isLooping={false}
                  onLoadStart={() => setLoading(true)}
                  onLoad={() => setLoading(false)}
                  onPlaybackStatusUpdate={onVideoStatusUpdate}
                />

                {loading ? (
                  <View style={styles.loader}>
                    <ActivityIndicator size="large" color="#00BCD4" />
                  </View>
                ) : null}
              </View>
            )}
          </View>

          {/* Navigation zones */}
          <View style={styles.tapZones}>

            <Pressable style={styles.leftZone} onPress={retreat} />
            <Pressable style={styles.rightZone} onPress={advance} />
          </View>

          {/* Close button */}
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
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  backdropTint: { ...StyleSheet.absoluteFillObject, backgroundColor: '#05050A80' },
  content: {
    flex: 1,
    paddingTop: 18,
    overflow: 'hidden',
  },

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
    backgroundColor: '#ffffff22',
  },
  progressFilledBg: { backgroundColor: '#E040FB66' },
  progressFill: {
    flex: 1,
    height: '100%',
    backgroundColor: '#E040FB',
    transformOrigin: 'left',
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

  tapZones: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row' },
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

  bottomControls: { position: 'absolute', bottom: 24, width: '100%', paddingHorizontal: 16 },
  muteBtn: {
    flexDirection: 'row',
    alignSelf: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#0F0F1A80',
    borderWidth: 1,
    borderColor: '#2A2A4044',
  },
  muteText: { color: '#fff', fontWeight: '800' },
});

