import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import StoryModal from '@/components/StoryModal';
import StoryCard from '@/components/StoryCard';
import {
  type StoryEntry,
  getActiveZip,
  generateStoryUri,
} from '@/utils/stories';

const STORAGE_KEY = 'instainsight_stories';
const COL_GAP = 10;

type StoryRenderItem = StoryEntry & { uri: string };

function monthSortKey(k: string) {
  const [y, m] = k.split('-').map(Number);
  return (y || 0) * 100 + (m || 0);
}

export default function StoriesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [stories, setStories] = useState<StoryRenderItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const objectUrls = useRef<Set<string>>(new Set());

  const openStory = useCallback((index: number) => {
    setSelectedIndex(index);
    setViewerVisible(true);
  }, []);

  const columnCount = useMemo(() => {
    if (width < 520) return 2;
    if (width < 860) return 3;
    return 4;
  }, [width]);

  const padding = 16;
  const thumbSize = useMemo(() => {
    const usable = width - padding * 2;
    const totalGap = COL_GAP * (columnCount - 1);
    return Math.max(62, Math.floor((usable - totalGap) / columnCount));
  }, [width, columnCount]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) {
          if (mounted) setLoading(false);
          return;
        }

        const parsed: { stories: StoryEntry[] } = JSON.parse(raw);
        const entries: StoryEntry[] = parsed?.stories ?? [];
        if (!entries.length) {
          if (mounted) setLoading(false);
          return;
        }

        console.log('[Stories] Loaded metadata entries:', entries.length);

        const zip = getActiveZip();
        if (!zip) {
          if (mounted) {
            setError('Session expired. Please re-import your ZIP file.');
            setLoading(false);
          }
          return;
        }

        const renderItems: StoryRenderItem[] = [];
        for (const entry of entries) {
          if (!mounted) return;
          const uri = await generateStoryUri(zip, entry.path, entry.type);
          if (uri) {
            if (typeof uri === 'string' && uri.startsWith('blob:')) {
              objectUrls.current.add(uri);
            }
            renderItems.push({ ...entry, uri });
          }
        }

        console.log('[Stories] Generated URIs:', renderItems.length);

        if (mounted) {
          setStories(renderItems);
        }
      } catch (e) {
        if (mounted) {
          setError('Failed to load stories. Please re-import.');
          console.error('[Stories] Error:', e);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      for (const url of objectUrls.current) {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      }
      objectUrls.current.clear();
    };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, StoryRenderItem[]>();
    for (const s of stories) {
      const arr = map.get(s.month) || [];
      arr.push(s);
      map.set(s.month, arr);
    }
    const keys = Array.from(map.keys()).sort((a, b) => monthSortKey(b) - monthSortKey(a));
    return keys.map((k) => ({
      monthKey: k,
      monthLabel: k.replace('-', ' / '),
      items: map.get(k)!,
    }));
  }, [stories]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#00BCD4" />
        <Text style={styles.loadingText}>Loading stories...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="alert-circle" size={44} color="#FF5252" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/upload')}>
          <Ionicons name="cloud-upload" size={18} color="#0F0F1A" />
          <Text style={styles.primaryBtnText}>Re-import ZIP</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!stories.length) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="time" size={44} color="#444" />
        <Text style={styles.emptyText}>No saved stories found in this export.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/gallery')}>
          <Ionicons name="image" size={18} color="#0F0F1A" />
          <Text style={styles.primaryBtnText}>Back to Gallery</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
          </View>
        }
        renderItem={({ item: month }) => (
          <View style={styles.monthBlock}>
            <Text style={styles.monthLabel}>{month.monthLabel}</Text>
            <FlatList
              key={`cols-${columnCount}-${month.monthKey}`}
              data={month.items}
              numColumns={columnCount}
              scrollEnabled={false}
              columnWrapperStyle={{ gap: COL_GAP }}
              keyExtractor={(it) => it.path}
              renderItem={({ item, index }) => {
                const globalIndex = stories.findIndex((s) => s.path === item.path);
                return (
                  <View style={{ width: thumbSize, marginBottom: COL_GAP }}>
                    <StoryCard
                      item={{
                        uri: item.uri,
                        type: item.type,
                        label: month.monthLabel,
                      }}
                      index={globalIndex >= 0 ? globalIndex : index}
                      onPress={openStory}
                      size={thumbSize}
                    />
                  </View>
                );
              }}
            />
          </View>
        )}
      />

      <StoryModal
        visible={viewerVisible}
        stories={stories.map((s) => ({ uri: s.uri, type: s.type }))}
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
  content: { padding: 16, paddingBottom: 140, paddingTop: 18 },

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
  note: { color: '#AAA', fontSize: 13, marginTop: 12, lineHeight: 18 },
  noteStrong: { color: '#fff', fontWeight: '900' },
  divider: { height: 1, backgroundColor: '#2A2A40', marginVertical: 14 },
  monthBlock: { marginBottom: 18 },
  monthLabel: { color: '#fff', fontSize: 14, fontWeight: '900', marginBottom: 10 },

  loadingText: { color: '#AAA', fontSize: 13, fontWeight: '700', marginTop: 10 },
  errorText: {
    color: '#FF5252',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 20,
  },
  emptyText: {
    color: '#AAA',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 20,
  },

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
