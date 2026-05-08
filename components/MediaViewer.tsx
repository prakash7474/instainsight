import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeOut, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

import type { ViewerItem } from '@/utils/viewerUtils';

const { width, height } = Dimensions.get('window');

export type MediaViewerProps = {
  items: ViewerItem[];
  initialIndex: number;
  onClose: () => void;
};

export function MediaViewer({ items, initialIndex, onClose }: MediaViewerProps) {
  const [index, setIndex] = useState(() => Math.max(0, Math.min(initialIndex, items.length - 1)));
  const [loading, setLoading] = useState(true);

  const overlayOpacity = useSharedValue(0);
  const zoomScale = useSharedValue(0.95);
  const dragY = useSharedValue(0);

  const current = items[index];

  useEffect(() => {
    setLoading(true);
  }, [index]);

  useEffect(() => {
    overlayOpacity.value = withTiming(1, { duration: 220 });
    zoomScale.value = withTiming(1, { duration: 240 });
  }, []);

  useEffect(() => {
    const next = items[index + 1];
    if (next?.kind === 'image') {
      try {
        Image.prefetch(next.uri);
      } catch {}
    }
  }, [index, items]);

  const animatedOverlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const animatedMediaStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }, { scale: zoomScale.value }] }));

  const go = (dir: -1 | 1) => {
    setIndex((prev) => {
      const next = prev + dir;
      if (next < 0 || next >= items.length) return prev;
      return next;
    });
  };

  const close = () => {
    overlayOpacity.value = withTiming(0, { duration: 160 });
    zoomScale.value = withTiming(0.98, { duration: 160 });
    runOnJS(onClose)();
  };

  const gesture = useMemo(() => {
    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

    const panDown = Gesture.Pan()
      .onUpdate((e) => {
        if (zoomScale.value <= 1.02 && e.translationY > 0) {
          dragY.value = clamp(e.translationY, 0, 180);
        }
      })
      .onEnd((e) => {
        if (zoomScale.value <= 1.02 && e.translationY > 120) {
          runOnJS(onClose)();
          dragY.value = 0;
        } else {
          dragY.value = withTiming(0, { duration: 140 });
        }
      });

    const pinch = Gesture.Pinch()
      .onUpdate((e) => {
        const next = (zoomScale.value || 1) * (e.scale || 1);
        zoomScale.value = clamp(next, 0.95, 2.5);
      })
      .onEnd(() => {
        if (zoomScale.value < 1.05) zoomScale.value = withTiming(1, { duration: 160 });
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDelay(250)
      .onEnd(() => {
        zoomScale.value = withTiming(1, { duration: 160 });
      });

    return Gesture.Simultaneous(panDown, pinch, doubleTap);
  }, [items.length]);


  const currentLabel = `${index + 1} / ${items.length}`;

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.backdrop, animatedOverlayStyle]}>
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
      </Animated.View>

      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.mediaWrap, animatedMediaStyle]}>
          {current?.kind === 'image' ? (
            <>
              <Image
                source={{ uri: current.uri }}
                style={styles.image}
                resizeMode="contain"
                onLoadStart={() => setLoading(true)}
                onLoadEnd={() => setLoading(false)}
              />
              {loading && (
                <View style={styles.loader}>
                  <ActivityIndicator size="large" color="#E040FB" />
                </View>
              )}
            </>
          ) : (
            <View style={[styles.image, styles.videoPlaceholder]}>
              <Text style={styles.videoText}>Video playback not wired yet</Text>
              {loading && (
                <View style={styles.loader}>
                  <ActivityIndicator size="large" color="#E040FB" />
                </View>
              )}
            </View>
          )}
        </Animated.View>
      </GestureDetector>

      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={styles.topBar}>
        <Text style={styles.indexText}>{currentLabel}</Text>
      </Animated.View>

      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={styles.navLeft}>
        <Pressable onPress={() => go(-1)} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </Pressable>
      </Animated.View>

      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={styles.navRight}>
        <Pressable onPress={() => go(1)} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={28} color="#fff" />
        </Pressable>
      </Animated.View>

      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={styles.closeWrap}>
        <Pressable onPress={close} style={styles.closeBtn}>
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
  backdrop: { ...StyleSheet.absoluteFillObject },

  mediaWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 20 },
  image: { width, height, maxWidth: width, maxHeight: height },

  videoPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0b14' },
  videoText: { color: '#fff', fontWeight: '700' },

  loader: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },

  topBar: {
    position: 'absolute',
    top: 24,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#0F0F1A88',
    borderWidth: 1,
    borderColor: '#2A2A4044',
  },

  indexText: { color: '#fff', fontWeight: '800' },

  navLeft: { position: 'absolute', left: 16, top: height / 2 - 26 },
  navRight: { position: 'absolute', right: 16, top: height / 2 - 26 },
  navBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#0F0F1A80',
    borderWidth: 1,
    borderColor: '#2A2A4044',
    alignItems: 'center',
    justifyContent: 'center',
  },

  closeWrap: { position: 'absolute', right: 16, top: 22 },
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

