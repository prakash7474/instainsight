import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { G, Path, Circle, Text as SvgText } from 'react-native-svg';

import type { ExtractedMedia } from './media/types';

const { width } = Dimensions.get('window');

interface InstagramData {
  followers: string[];
  following: string[];
  pendingRequests?: string[];
  engagement?: {
    topLikes: { user: string; count: number }[];
    totalLikes: number;
    totalComments: number;
  };
  activity?: {
    loginHistory: number[];
  };
  processedAt: number;
}

interface Stats {
  totalFollowers: number;
  totalFollowing: number;
  notFollowingBack: number;
  dontFollowBack: number;
  mutuals: number;
  pendingRequests: number;
}

function computeStats(data: InstagramData): Stats {
  const followerSet = new Set(data.followers);
  const followingSet = new Set(data.following);

  const notFollowingBack = data.following.filter((u) => !followerSet.has(u)).length;
  const dontFollowBack = data.followers.filter((u) => !followingSet.has(u)).length;
  const mutuals = data.following.filter((u) => followerSet.has(u)).length;
  const pendingRequests = data.pendingRequests?.length || 0;

  return {
    totalFollowers: data.followers.length,
    totalFollowing: data.following.length,
    notFollowingBack,
    dontFollowBack,
    mutuals,
    pendingRequests,
  };
}

function PieChart({ data }: { data: { value: number; color: string; label: string }[] }) {
  const size = width - 80;
  const r = size / 2 - 20;
  const cx = size / 2;
  const cy = size / 2;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;

  let startAngle = -Math.PI / 2;
  const slices = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const angle = (d.value / total) * 2 * Math.PI;
      const endAngle = startAngle + angle;
      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const large = angle > Math.PI ? 1 : 0;
      const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
      startAngle = endAngle;
      return { ...d, path };
    });

  return (
    <Svg width={size} height={size}>
      {slices.map((s, i) => (
        <Path key={i} d={s.path} fill={s.color} opacity={0.9} />
      ))}
      <Circle cx={cx} cy={cy} r={r * 0.45} fill="#13131F" />
    </Svg>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
  onPress,
}: {
  label: string;
  value: number;
  icon: string;
  color: string;
  onPress?: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 80,
      friction: 6,
    }).start();
  }, []);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.75 : 1} style={{ flex: 1 }}>
      <Animated.View
        style={[
          styles.statCard,
          { borderColor: color + '55', transform: [{ scale: scaleAnim }] },
        ]}
      >
        <View style={[styles.statIconWrap, { backgroundColor: color + '22' }]}>
          <Ionicons name={icon as any} size={22} color={color} />
        </View>
        <Text style={[styles.statValue, { color }]}>{value.toLocaleString()}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

function BarChart({ stats }: { stats: Stats }) {
  const bars = [
    { label: 'Followers', value: stats.totalFollowers, color: '#E040FB' },
    { label: 'Following', value: stats.totalFollowing, color: '#7C4DFF' },
    { label: 'Mutuals', value: stats.mutuals, color: '#00BCD4' },
    { label: 'Not Back', value: stats.notFollowingBack, color: '#FF5252' },
    { label: "Don't Back", value: stats.dontFollowBack, color: '#FFC107' },
  ];
  const maxVal = Math.max(...bars.map((b) => b.value), 1);
  const chartWidth = width - 80;
  const chartHeight = 140;
  const barWidth = (chartWidth / bars.length) * 0.55;
  const gapWidth = chartWidth / bars.length;

  return (
    <View style={styles.barChartWrap}>
      <Svg width={chartWidth} height={chartHeight + 30}>
        {bars.map((b, i) => {
          const barH = (b.value / maxVal) * chartHeight;
          const x = i * gapWidth + (gapWidth - barWidth) / 2;
          const y = chartHeight - barH;
          return (
            <G key={i}>
              <Path
                d={`M ${x} ${chartHeight} L ${x} ${y} L ${x + barWidth} ${y} L ${x + barWidth} ${chartHeight} Z`}
                fill={b.color}
                opacity={0.85}
              />
              <SvgText
                x={x + barWidth / 2}
                y={chartHeight + 20}
                fontSize="9"
                fill="#888"
                textAnchor="middle"
              >
                {b.label}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.statPill, { borderColor: color + '55' }]}>
      <Text style={[styles.statPillValue, { color }]}>{value.toLocaleString()}</Text>
      <Text style={styles.statPillLabel}>{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();

  const [data, setData] = useState<InstagramData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  const [media, setMedia] = useState<ExtractedMedia | null>(null);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'followers' | 'engagement' | 'activity'>('followers');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const openGallery = () => router.push('/gallery');
  const openStories = () => router.push('/stories');

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    const stored = await AsyncStorage.getItem('instainsight_data');
    if (stored) {
      const parsed: InstagramData = JSON.parse(stored);
      setData(parsed);
      setStats(computeStats(parsed));
    }

    const storedMedia = await AsyncStorage.getItem('instainsight_media_v1');
    if (storedMedia) {
      try {
        setMedia(JSON.parse(storedMedia) as ExtractedMedia);
      } catch {
        setMedia(null);
      }
    }

    setLoading(false);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  };

  const clearData = async () => {
    await AsyncStorage.removeItem('instainsight_data');
    await AsyncStorage.removeItem('instainsight_media_v1');
    router.replace('/');
  };

  const processedDate = useMemo(() => {
    if (!data) return '';
    return new Date(data.processedAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [data]);

  const mediaCounts = useMemo(() => {
    const archivedCount = media?.meta.archivedCount ?? 0;
    const storiesCount = media?.meta.storiesCount ?? 0;
    const totalPhotos = media?.meta.totalPhotos ?? 0;
    return { archivedCount, storiesCount, totalPhotos };
  }, [media]);

  const mostActiveMonthLabel = useMemo(() => {
    // best-effort: pick month with most total images across archived+stories
    if (!media) return '—';

    const map = new Map<string, number>();
    const add = (m: { label: string; images: unknown[] }) => {
      map.set(m.label, (map.get(m.label) ?? 0) + (m.images?.length ?? 0));
    };

    media.archived.forEach((m) => add(m as any));
    media.stories.forEach((m) => add(m as any));

    let bestLabel = '—';
    let best = -1;
    for (const [k, v] of map.entries()) {
      if (v > best) {
        best = v;
        bestLabel = k;
      }
    }
    return bestLabel;
  }, [media]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#E040FB" />
      </View>
    );
  }

  if (!data || !stats) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="cloud-offline" size={54} color="#444" />
        <Text style={styles.noDataTitle}>No Data Yet</Text>
        <Text style={styles.noDataSub}>Import your Instagram ZIP to get started</Text>
        <TouchableOpacity style={styles.importBtn} onPress={() => router.push('/upload')}>
          <Text style={styles.importBtnText}>Import Now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pieData = [
    { label: 'Mutuals', value: stats.mutuals, color: '#00BCD4' },
    { label: 'Not Following Back', value: stats.notFollowingBack, color: '#FF5252' },
    { label: "Don't Follow Back", value: stats.dontFollowBack, color: '#FFC107' },
  ];

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0F0F1A', '#1A0A2E', '#0F0F1A']} style={StyleSheet.absoluteFillObject} />

      <View style={styles.tabBar}>
        {(['followers', 'engagement', 'activity'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Animated.ScrollView
        style={{ opacity: fadeAnim }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>
              {activeTab === 'followers' ? 'Followers' : activeTab === 'engagement' ? 'Engagement' : 'Activity'}
            </Text>
            <Text style={styles.headerSub}>Updated {processedDate}</Text>
          </View>
          <TouchableOpacity onPress={clearData} style={styles.clearBtn}>
            <Ionicons name="trash-outline" size={18} color="#FF5252" />
          </TouchableOpacity>
        </View>

        {/* Media Intelligence */}
        <View style={styles.mediaSection}>
          <View style={styles.mediaHeaderRow}>
            <View style={styles.mediaIconWrap}>
              <LinearGradient
                colors={['#E040FB', '#7C4DFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.mediaIconGradient}
              >
                <Ionicons name="image-outline" size={20} color="#fff" />
              </LinearGradient>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.mediaTitle}>Media Intelligence</Text>
              <Text style={styles.mediaSubtitle}>Analyze your Instagram memories</Text>
            </View>
          </View>

          <View style={styles.mediaStatsGrid}>
            {/* Counts intentionally hidden for now */}
          </View>

          <View style={styles.mediaMetaRow}>
            <View style={[styles.mediaMetaChip, { borderColor: '#E040FB44' }]}>
              <Text style={styles.mediaMetaLabel}>Most Active Month</Text>
              <Text style={styles.mediaMetaValue}>{mostActiveMonthLabel}</Text>
            </View>
          </View>


          <View style={styles.mediaActionsRow}>
            <TouchableOpacity
              style={[styles.mediaBtn, { borderColor: '#E040FB55' }]}
              onPress={openGallery}
              activeOpacity={0.85}
            >
              <Ionicons name="albums-outline" size={18} color="#E040FB" />
              <Text style={[styles.mediaBtnText, { color: '#E040FB' }]}>Posts</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.mediaBtn, { borderColor: '#00E67655' }]}
              onPress={openStories}
              activeOpacity={0.85}
            >
              <Ionicons name="play-circle-outline" size={18} color="#00E676" />
              <Text style={[styles.mediaBtnText, { color: '#00E676' }]}>Stories</Text>
            </TouchableOpacity>
          </View>
        </View>

        {activeTab === 'followers' && (
          <>
            <View style={styles.statsGrid}>
              <StatCard label="Followers" value={stats.totalFollowers} icon="people" color="#E040FB" />
              <StatCard label="Following" value={stats.totalFollowing} icon="person-add" color="#7C4DFF" />
            </View>
            <View style={styles.statsGrid}>
              <StatCard
                label="Not Following"
                value={stats.notFollowingBack}
                icon="person-remove"
                color="#FF5252"
                onPress={() => router.push({ pathname: '/userlist', params: { type: 'notfollowingback' } })}
              />
              <StatCard
                label="Mutuals"
                value={stats.mutuals}
                icon="people-circle"
                color="#00BCD4"
                onPress={() => router.push({ pathname: '/userlist', params: { type: 'mutuals' } })}
              />
            </View>
            <View style={styles.statsGrid}>
              <StatCard
                label="Pending"
                value={stats.pendingRequests}
                icon="time-outline"
                color="#FFC107"
                onPress={() => router.push({ pathname: '/userlist', params: { type: 'pending' } })}
              />
              <View style={{ flex: 1 }} />
            </View>
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Relationship Distribution</Text>
              <PieChart data={pieData} />
              <View style={styles.legend}>
                {pieData.map((d, i) => (
                  <View key={i} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: d.color }]} />
                    <Text style={styles.legendLabel}>
                      {d.label} ({d.value})
                    </Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Overview Comparison</Text>
              <BarChart stats={stats} />
            </View>
          </>
        )}

        {activeTab === 'engagement' && (
          <View style={styles.fadeContainer}>
            <View style={styles.statsGrid}>
              <StatCard
                label="Total Liked Posts"
                value={data.engagement?.totalLikes || 0}
                icon="heart"
                color="#E91E63"
              />
              <StatCard
                label="Total Comments"
                value={data.engagement?.totalComments || 0}
                icon="chatbubble"
                color="#2196F3"
              />
            </View>

            <View style={styles.actionsCard}>
              <Text style={styles.chartTitle}>🏆 Top Interacted Users</Text>
              <Text style={styles.cardSub}>Based on your likes and comments</Text>
              {data.engagement?.topLikes?.length ? (
                data.engagement.topLikes.map((u, i) => (
                  <View key={i} style={styles.actionRow}>
                    <Text style={styles.rankText}>#{i + 1}</Text>
                    <Text style={styles.actionLabel}>@{u.user}</Text>
                    <Text style={styles.countTag}>{u.count} interactions</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyNote}>No interaction data found in ZIP.</Text>
              )}
            </View>
          </View>
        )}

        {activeTab === 'activity' && (
          <View style={styles.fadeContainer}>
            <View style={styles.chartCard}>
              <Ionicons name="time" size={40} color="#00E676" style={{ marginBottom: 12 }} />
              <Text style={styles.chartTitle}>Usage Summary</Text>
              <Text style={styles.statValue}>{data.activity?.loginHistory?.length || 0}</Text>
              <Text style={styles.statLabel}>Total App Logins Recorded</Text>
            </View>

            <View style={styles.actionsCard}>
              <Text style={styles.chartTitle}>📅 Activity Timeline</Text>
              <Text style={styles.cardSub}>Account interactions over time (last 10 events)</Text>
              {data.activity?.loginHistory?.length ? (
                data.activity.loginHistory.slice(0, 10).map((ts, i) => (
                  <View key={i} style={styles.actionRow}>
                    <Ionicons name="flash-outline" size={16} color="#00E676" />
                    <Text style={styles.actionLabel}>{new Date(ts).toLocaleString()}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyNote}>Activity data not included in export.</Text>
              )}
            </View>
          </View>
        )}

        <TouchableOpacity style={styles.reimportBtn} onPress={() => router.push('/upload')}>
          <Ionicons name="refresh" size={18} color="#E040FB" />
          <Text style={styles.reimportText}>Import New Data</Text>
        </TouchableOpacity>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F1A' },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingTop: 28, paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 12, color: '#666', marginTop: 4 },

  clearBtn: {
    backgroundColor: '#FF525211',
    padding: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2A40',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: '#13131F',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A40',
  },
  tab: {
    paddingVertical: 12,
    marginRight: 20,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: { borderBottomColor: '#E040FB' },
  tabText: { color: '#666', fontSize: 13, fontWeight: '600' },
  activeTabText: { color: '#E040FB' },

  // Media Intelligence
  mediaSection: {
    backgroundColor: '#13131F',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2A2A40',
    marginBottom: 18,
    overflow: 'hidden',
  },
  mediaHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  mediaIconWrap: { width: 44, height: 44, borderRadius: 16, borderWidth: 1, borderColor: '#E040FB33', overflow: 'hidden' },
  mediaIconGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mediaTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  mediaSubtitle: { color: '#888', fontSize: 12, marginTop: 3 },

  mediaStatsGrid: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  mediaMetaRow: { marginBottom: 14 },
  mediaMetaChip: { borderWidth: 1, borderRadius: 16, padding: 14, backgroundColor: '#0F0F1A' },
  mediaMetaLabel: { color: '#888', fontSize: 12, fontWeight: '700' },
  mediaMetaValue: { color: '#fff', fontSize: 14, fontWeight: '800', marginTop: 4 },

  mediaActionsRow: { flexDirection: 'row', gap: 12 },
  mediaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: '#1A1A2E',
  },
  mediaBtnText: { fontWeight: '800', fontSize: 14 },

  // Followers/Engagement/Activity shared
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },

  statCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 6,
  },
  statIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: 11, color: '#888', textAlign: 'center' },

  // Pie/Bar
  chartCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2A40',
    alignItems: 'center',
  },
  chartTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 16, alignSelf: 'flex-start' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { color: '#aaa', fontSize: 12 },

  barChartWrap: { alignItems: 'center', width: '100%' },

  fadeContainer: { width: '100%', marginBottom: 10 },

  actionsCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2A40',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A4044',
    gap: 14,
  },
  actionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { flex: 1, color: '#DDD', fontSize: 14, fontWeight: '500' },
  rankText: { color: '#E040FB', fontWeight: '800', width: 28 },
  countTag: {
    color: '#666',
    fontSize: 11,
    backgroundColor: '#222',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },

  reimportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E040FB44',
    backgroundColor: '#E040FB11',
    marginBottom: 20,
  },
  reimportText: { color: '#E040FB', fontWeight: '600', fontSize: 15 },

  noDataTitle: { fontSize: 20, fontWeight: '700', color: '#fff', marginTop: 16 },
  noDataSub: { fontSize: 14, color: '#666', marginTop: 8, marginBottom: 24 },

  importBtn: {
    backgroundColor: '#7C4DFF',
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  importBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  cardSub: { color: '#888', fontSize: 12, marginTop: -12, marginBottom: 16 },
  emptyNote: { color: '#666', fontSize: 13, textAlign: 'center', marginVertical: 20 },

  // StatPill
  statPill: { borderWidth: 1, borderRadius: 18, padding: 14, backgroundColor: '#0F0F1A', flex: 1 },
  statPillValue: { fontSize: 18, fontWeight: '900' },
  statPillLabel: { color: '#888', fontSize: 11, marginTop: 6, fontWeight: '700' },
});
