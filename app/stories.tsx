import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MediaStore } from '@/utils/mediaTypes';

import { inferViewerKind } from '@/utils/viewerUtils';

import StoryModal from '@/components/StoryModal';
import { StoryCard } from '@/components/StoryCard';


const STORAGE_KEY_MEDIA = 'instainsight_media';

function monthSortKey(k: string) {
  // k = YYYY-MM
  const [y, m] = k.split('-').map((x) => Number(x));
  return (y || 0) * 100 + (m || 0);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((x): x is string => typeof x === 'string');
}

function safeRecordOfStringArrays(input: unknown): Record<string, string[]> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const obj = input as Record<string, unknown>;
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = safeStringArray(v);
  }
  return out;
}

export default function StoriesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  // Required connection flow state
  const [stories, setStories] = useState<Array<{ uri: string; type: 'image' | 'video' }>>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);

  const [loading, setLoading] = useState(true);

  const [media, setMedia] = useState<MediaStore | null>(null);

  const columnCount = useMemo(() => {
    // mobile-first
    if (width < 520) return 2;
    if (width < 860) return 3;
    // web/tablet: 4+ columns
    return 4;
  }, [width]);

  const padding = 16;
  const gap = 10;
  const thumbSize = useMemo(() => {
    // 2*padding for content area; gap between columns
    const usable = width - padding * 2;
    const totalGap = gap * (columnCount - 1);
    const s = (usable - totalGap) / columnCount;
    return Math.max(62, Math.floor(s));
  }, [width, columnCount]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);

        const storedMedia = await AsyncStorage.getItem(STORAGE_KEY_MEDIA);
        if (!storedMedia) {
          if (mounted) setMedia(null);
          if (mounted) setStories([]);
          return;
        }

        const parsed = JSON.parse(storedMedia) as any;

        // Persisted structure: { posts: Record<YYYY-MM, string[]>, stories: Record<YYYY-MM, string[]> }
        const safe: MediaStore = {
          posts: safeRecordOfStringArrays(parsed?.posts),
          stories: safeRecordOfStringArrays(parsed?.stories),
          processedAt: typeof parsed?.processedAt === 'number' ? parsed.processedAt : Date.now(),
          meta: parsed?.meta,
        };

        if (!mounted) return;
        setMedia(safe);

        // Flatten stories by newest-first month order (YYYY-MM buckets)
        const monthKeys = Object.keys(safe.stories ?? {});
        monthKeys.sort((a, b) => monthSortKey(b) - monthSortKey(a));

        const flattened: Array<{ uri: string; type: 'image' | 'video' }> = [];
        for (const mk of monthKeys) {
          const uris = safe.stories?.[mk] ?? [];
          for (const uri of uris) {
            const kind = inferViewerKind(uri);
            flattened.push({ uri, type: kind === 'video' ? 'video' : 'image' });
          }
        }

        if (mounted) setStories(flattened);

      } catch {
        if (!mounted) return;
        setMedia(null);
        setStories([]);
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
      const storiesBuckets = media?.stories ?? {};
      for (const items of Object.values(storiesBuckets)) {
        for (const uri of items) {
          if (typeof uri === 'string' && uri.startsWith('blob:')) {
            try {
              URL.revokeObjectURL(uri);
            } catch {
              // ignore
            }
          }
        }
      }
    };
  }, [media]);

  const grouped = useMemo(() => {
    const storiesMap = media?.stories ?? {};
    const keys = Object.keys(storiesMap);

    keys.sort((a, b) => monthSortKey(b) - monthSortKey(a));

    // Build month groups and map each uri to global index in flattened `stories`
      const monthGroups: Array<{ monthKey: string; monthLabel: string; items: Array<{ uri: string; globalIndex: number; isVideo: boolean }> }> = [];


    const flatIndexByUri = new Map<string, number>();
    // Because duplicates can exist, we also need occurrences. We'll compute indices by iterating monthKeys in same order
    let global = 0;

    for (const monthKey of keys) {
      const uris = storiesMap?.[monthKey] ?? [];
      const monthLabel = monthKey.replace('-', ' / ');

      const items: Array<{ uri: string; globalIndex: number; isVideo: boolean }> = [];
      for (let i = 0; i < uris.length; i++) {
        const uri = uris[i];
        const kind = inferViewerKind(uri);
        const isVideo = kind === 'video';

        // Determine global index by current global counter
        const currentGlobalIndex = global;
        global += 1;

        // If duplicates exist, we cannot map by uri only; so store occurrence-based via items list.
        items.push({ uri, globalIndex: currentGlobalIndex, isVideo });
        flatIndexByUri.set(`${uri}@@${i}`, currentGlobalIndex);
      }

      monthGroups.push({ monthKey, monthLabel, items });
    }

    return monthGroups;
  }, [media]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#00BCD4" />
        <Text style={styles.loadingText}>Loading your stories…</Text>
      </View>
    );
  }

  console.log(stories);

  return (
    <View style={styles.container}>

      <LinearGradient
        colors={['#0F0F1A', '#1A0A2E', '#0F0F1A']}
        style={StyleSheet.absoluteFillObject}
      />

      <FlatList
        data={grouped}
        keyExtractor={(it) => it.monthKey}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.headerCard}>
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
              Stories saved: <Text style={styles.noteStrong}>{stories.length}</Text>
            </Text>

            <View style={styles.divider} />

            {grouped.length === 0 ? (
              <Text style={styles.noteDim}>No saved stories found in this ZIP export.</Text>
            ) : null}
          </View>
        }
        renderItem={({ item: month }) => {
          return (
            <View style={styles.monthBlock}>
              <Text style={styles.monthLabel}>{month.monthLabel}</Text>

              <FlatList
                key={`columns-${columnCount}`}
                data={month.items}

                keyExtractor={(it) => `${month.monthKey}-${it.globalIndex}`}
                numColumns={columnCount}
                scrollEnabled={false}
                columnWrapperStyle={{ gap }}

                renderItem={({ item }) => (
                  <View style={{ width: thumbSize, marginBottom: gap }}>
                    <StoryCard
                      uri={item.uri}
                      size={thumbSize}
                      isVideo={item.isVideo}
                      onPress={() => {
                        const safeIndex = clamp(item.globalIndex, 0, Math.max(0, stories.length - 1));
                        setSelectedIndex(safeIndex);
                        setViewerVisible(true);
                      }}
                    />
                  </View>
                )}
              />
            </View>
          );
        }}
      />

      <StoryModal
        visible={viewerVisible}
        stories={stories}
        initialIndex={selectedIndex}
        onClose={() => setViewerVisible(false)}
      />



      <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/gallery')}>
        <Ionicons name="image" size={18} color="#0F0F1A" />
        <Text style={styles.primaryBtnText}>Back to Gallery</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F1A' },
  center: { alignItems: 'center', justifyContent: 'center' },

  content: {
    padding: 16,
    paddingBottom: 140,
    paddingTop: 18,
  },

  headerCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2A40',
    padding: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
    marginBottom: 16,
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
  title: { color: '#fff', fontSize: 22, fontWeight: '900' },
  subtitle: { color: '#888', fontSize: 12, marginTop: 4, fontWeight: '700' },

  loadingText: { color: '#AAA', fontSize: 13, fontWeight: '700', marginTop: 10 },

  note: { color: '#AAA', fontSize: 13, marginTop: 12, lineHeight: 18 },
  noteStrong: { color: '#fff', fontWeight: '900' },
  noteDim: { color: '#777', fontSize: 13, marginTop: 12, lineHeight: 18 },

  divider: { height: 1, backgroundColor: '#2A2A40', marginVertical: 14 },

  monthBlock: { marginBottom: 18 },
  monthLabel: { color: '#fff', fontSize: 14, fontWeight: '900', marginBottom: 10 },

  primaryBtn: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#00BCD4',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  primaryBtnText: { color: '#0F0F1A', fontWeight: '900', fontSize: 15 },
});

