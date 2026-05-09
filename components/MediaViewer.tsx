import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeOut, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

import type { ViewerItem } from '@/utils/viewerUtils';
import { useRouter } from 'expo-router';

const { width, height } = Dimensions.get('window');

export type MediaViewerProps = {
  items: ViewerItem[];
  initialIndex: number;
  onClose: () => void;
};

export function MediaViewer({ items, initialIndex, onClose }: MediaViewerProps) {
  const router = useRouter();
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
  const animatedBlurStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));
  const animatedMediaStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }, { scale: zoomScale.value }],
  }));

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
        <BlurView
          intensity={60}
          tint="dark"
          style={[StyleSheet.absoluteFillObject, animatedBlurStyle]}
        />
      </Animated.View>

      <GestureDetector gesture={gesture}>
        <View style={styles.cardStage}>
          <Animated.View style={[styles.mediaCard, animatedMediaStyle]}>
            <View style={styles.mediaInner}>
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
            </View>

            {/* Footer attached to the media card */}
            <View style={styles.footer}>
              <Pressable onPress={() => go(-1)} style={styles.footerBtn}>
                <Ionicons name="chevron-back" size={22} color="#fff" />
              </Pressable>

              <View style={styles.pager}>
                <Text style={styles.pagerText}>{currentLabel}</Text>
              </View>

              <Pressable onPress={() => go(1)} style={styles.footerBtn}>
                <Ionicons name="chevron-forward" size={22} color="#fff" />
              </Pressable>

              <Pressable
                style={styles.storiesCtaWrap}
                onPress={() => {
                  close();
                  // close() already animates overlayOpacity and runs onClose.
                  // navigate on next tick to avoid modal render glitches
                  setTimeout(() => router.push('/stories'), 120);
                }}
              >
                <Ionicons name="albums-outline" size={18} color="#fff" />
                <Text style={styles.storiesCtaText}>Go to Stories</Text>
              </Pressable>

              <Pressable onPress={close} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color="#fff" />
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </GestureDetector>

      {/* Top-left metadata-ish header */}
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={styles.topHeader}>
        <Ionicons name="logo-instagram" size={22} color="#E040FB" />
        <Text style={styles.topHeaderTitle}>Instainsight</Text>
        <Text style={styles.topHeaderMeta}>Media Viewer</Text>
      </Animated.View>
    </View>
  );
}

const CARD_RADIUS = 24;
const CARD_MAX_WIDTH = 1200;

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
  backdrop: { ...StyleSheet.absoluteFillObject },

  cardStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  mediaCard: {
    width: '100%',
    maxWidth: Math.min(width - 24, CARD_MAX_WIDTH),
    backgroundColor: '#1A1A2E90',
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E040FB44',
    shadowColor: '#E040FB',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },

  mediaInner: {
    flexDirection: 'column',
    padding: 12,
    backgroundColor: '#0B0B1480',
    minHeight: height * 0.58,
    justifyContent: 'center',
    alignItems: 'center',
  },

  image: { width: '100%', height: '100%', maxHeight: 520, borderRadius: 16 },
  videoPlaceholder: {
    backgroundColor: '#0b0b14',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  videoText: { color: '#fff', fontWeight: '700', textAlign: 'center' },

  loader: { position: 'absolute', left: 12, right: 12, top: 12, bottom: 12, alignItems: 'center', justifyContent: 'center' },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: '#0F0F1A80',
    borderTopWidth: 1,
    borderTopColor: '#E040FB22',
  },

  footerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0F0F1A80',
    borderWidth: 1,
    borderColor: '#2A2A4044',
    alignItems: 'center',
    justifyContent: 'center',
  },

  pager: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pagerText: { color: '#fff', fontWeight: '800' },

  storiesCtaWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' },
  storiesCtaText: { color: '#E040FB', fontWeight: '900' },

  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0F0F1A80',
    borderWidth: 1,
    borderColor: '#2A2A4044',
    alignItems: 'center',
    justifyContent: 'center',
  },

  topHeader: {
    position: 'absolute',
    left: 16,
    top: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#0F0F1A70',
    borderWidth: 1,
    borderColor: '#2A2A4044',
  },
  topHeaderTitle: { color: '#fff', fontWeight: '900' },
  topHeaderMeta: { color: '#AAA', fontWeight: '700', fontSize: 12, marginLeft: 6 },
});

