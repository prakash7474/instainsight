import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Image, FlatList, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MediaStore } from './media/types';

const { width } = Dimensions.get('window');
const COLS = 3;
const GAP = 8;
const THUMB = (width - 32 - GAP * (COLS - 1)) / COLS;

function monthSortKey(k: string) {
  // k = YYYY-MM
  const [y, m] = k.split('-').map((x) => Number(x));
  return (y || 0) * 100 + (m || 0);
}

export default function StoriesScreen() {
  const router = useRouter();

  const [media, setMedia] = useState<MediaStore | null>(null);
  const [loading, setLoading] = useState(true);

  const normalizeMediaStore = (raw: any): MediaStore => {
    const postsIn = raw?.posts ?? {};
    const storiesIn = raw?.stories ?? {};

    const normalizeBucket = (bucket: any): string[] => {
      if (!Array.isArray(bucket)) return [];
      if (bucket.length === 0) return [];
      if (typeof bucket[0] === 'string') return bucket as string[];
      return (bucket as any[])
        .map((x) => (typeof x?.uri === 'string' ? x.uri : null))
        .filter((x): x is string => !!x);
    };

    const postsOut: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(postsIn)) postsOut[k] = normalizeBucket(v);

    const storiesOut: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(storiesIn)) storiesOut[k] = normalizeBucket(v);

    return {
      posts: postsOut,
      stories: storiesOut,
      processedAt: typeof raw?.processedAt === 'number' ? raw.processedAt : Date.now(),
      meta: raw?.meta,
    };
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const storedMedia = await AsyncStorage.getItem('instainsight_media');
        if (storedMedia && mounted) {
          const parsed = JSON.parse(storedMedia);
          setMedia(normalizeMediaStore(parsed));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Revoke blob URLs on web
  useEffect(() => {
    return () => {
      const stories = media?.stories ?? {};
      for (const items of Object.values(stories)) {
        for (const uri of items) {
          if (typeof uri === 'string' && uri.startsWith('blob:')) {
            try {
              URL.revokeObjectURL(uri);
            } catch {}
          }
        }
      }
    };
  }, [media]);

  const monthKeys = useMemo(() => {
    const keys = Object.keys(media?.stories ?? {});
    keys.sort((a, b) => monthSortKey(b) - monthSortKey(a)); // newest first
    return keys;
  }, [media]);

  const totalStories = useMemo(() => {
    const stories = media?.stories ?? {};
    return Object.values(stories).reduce((s, arr) => s + (arr?.length ?? 0), 0);
  }, [media]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#00BCD4" />
        <Text style={styles.loadingText}>Loading your stories…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0F0F1A', '#1A0A2E', '#0F0F1A']}
        style={StyleSheet.absoluteFillObject}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.glassCard}>
          <View style={styles.titleRow}>
            <View style={styles.iconWrap}>
              <Ionicons name="time" size={18} color="#00BCD4" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Stories</Text>
              <Text style={styles.subtitle}>Media Intelligence (Saved Stories)</Text>
            </View>
          </View>

          <Text style={styles.note}>
            Stories saved: <Text style={styles.noteStrong}>{totalStories}</Text>
          </Text>

          <View style={styles.divider} />

          {monthKeys.length === 0 ? (
            <Text style={styles.noteDim}>No saved stories found in this ZIP export.</Text>
          ) : (
            <FlatList
              data={monthKeys}
              keyExtractor={(k) => k}
              scrollEnabled={false}
              renderItem={({ item: monthKey }) => {
                const items = media?.stories?.[monthKey] ?? [];
                return (
                  <View style={{ marginBottom: 18 }}>
                    <Text style={styles.monthLabel}>{monthKey.replace('-', ' / ')}</Text>
                    <FlatList
                      data={items}
                      keyExtractor={(uri, i) => `${monthKey}-${i}-${uri}`}
                      numColumns={COLS}
                      scrollEnabled={false}
                      columnWrapperStyle={{ gap: GAP }}
                      renderItem={({ item: uri }) => (
                        <View style={{ width: THUMB, marginBottom: GAP }}>
                          <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
                        </View>
                      )}
                    />
                  </View>
                );
              }}
            />
          )}

          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/gallery')}>
            <Ionicons name="image" size={18} color="#0F0F1A" />
            <Text style={styles.primaryBtnText}>Back to Gallery</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F1A' },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingTop: 18, paddingBottom: 40 },
  glassCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2A40',
    padding: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#00BCD422',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#00BCD444',
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#888', fontSize: 12, marginTop: 4, fontWeight: '600' },

  loadingText: { color: '#AAA', fontSize: 13, fontWeight: '600', marginTop: 10 },

  note: { color: '#AAA', fontSize: 13, marginTop: 12, lineHeight: 18 },
  noteStrong: { color: '#fff', fontWeight: '900' },
  noteDim: { color: '#777', fontSize: 13, marginTop: 12, lineHeight: 18 },

  divider: { height: 1, backgroundColor: '#2A2A40', marginVertical: 14 },

  monthLabel: { color: '#fff', fontSize: 14, fontWeight: '800', marginBottom: 10 },

  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 12,
    backgroundColor: '#13131F',
  },

  primaryBtn: {
    marginTop: 16,
    backgroundColor: '#00BCD4',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryBtnText: { color: '#0F0F1A', fontWeight: '900', fontSize: 15 },
});
