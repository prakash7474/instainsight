import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import { useRouter } from 'expo-router';

import { useInstagramAnalyticsData } from '@/hooks/useInstagramAnalyticsData';
import ActivityScreen from '../screens/ActivityScreen';
import { toActivityData } from '../adapters/toActivityData';
import type { ActivityData } from '../screens/ActivityScreen';
import type { Analytics } from '@/utils/instagramAnalyticsUtils';
import { buildAnalytics } from '@/utils/instagramAnalyticsUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

type RelationshipListType =
  | 'notfollowingback'
  | 'dontfollowback'
  | 'mutuals'
  | 'pending'
  | 'followers'
  | 'following'
  | 'blocked'
  | 'restricted'
  | 'closefriends'
  | 'recentlyunfollowed'
  | 'removedsuggestions'
  | 'recentfollowrequests'
  | 'hashtags';

type TabKey = 'overview' | 'engagement' | 'activity';

function CategoryCard({
  title,
  value,
  color,
  icon,
  onPress,
  listType,
}: {
  title: string;
  value: number;
  color: string;
  icon: string;
  listType: RelationshipListType;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.moreCard, { borderColor: color + '44', backgroundColor: '#1A1A2E' }]}
    >
      <View style={[styles.moreCardIcon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.moreCardTitle}>{title}</Text>
        <Text style={styles.moreCardValue}>{value.toLocaleString()}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#555" />
    </TouchableOpacity>
  );
}

type LoginEntry = number;


interface InstagramData {
  followers: string[];
  following: string[];
  pendingRequests?: string[];
  engagement?: {
    topLikes: { user: string; count: number }[];
    topCombined: { user: string; likedPosts: number; likedComments: number; total: number }[];
    totalLikes: number;
    totalComments: number;
  };
  activity?: {
    loginHistory: LoginEntry[];
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

type StoredPayload = unknown;

const STORAGE_KEY_DATA = 'instainsight_data';
const STORAGE_KEY_MEDIA = 'instainsight_media';
const STORAGE_KEY_MEDIA_V1 = 'instainsight_media_v1';

function safeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (typeof v === 'string') out.push(v);
  }
  return out;
}

function safeNumber(input: unknown, fallback: number): number {
  return typeof input === 'number' && Number.isFinite(input) ? input : fallback;
}

function extractMonthKey(time: string): string {
  const m = time.match(/(\w{3})\s+\d+,\s+(\d{4})/);
  if (!m) return '';
  const months: Record<string, string> = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06', Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' };
  return `${m[2]}-${months[m[1]] || '00'}`;
}

function safeInstagramData(input: StoredPayload): InstagramData | null {
  if (!input || typeof input !== 'object') return null;


  const obj = input as Record<string, unknown>;
  const followers = safeStringArray(obj.followers);
  const following = safeStringArray(obj.following);

  // processedAt is required for UI label; if missing/corrupt, treat payload as invalid.
  const processedAt = safeNumber(obj.processedAt, NaN);
  if (!Number.isFinite(processedAt)) return null;

  const pendingRequests = obj.pendingRequests ? safeStringArray(obj.pendingRequests) : undefined;

  const engagementRaw = obj.engagement as any;
  const topLikesRaw = engagementRaw?.topLikes;
  const topLikes = Array.isArray(topLikesRaw)
    ? topLikesRaw
        .map((x: any) => ({
          user: typeof x?.user === 'string' ? x.user : '',
          count: safeNumber(x?.count, 0),
        }))
        .filter((x: any) => x.user)
    : [];

  const engagement = engagementRaw
    ? {
        topLikes,
        totalLikes: safeNumber(engagementRaw.totalLikes, 0),
        totalComments: safeNumber(engagementRaw.totalComments, 0),
      }
    : undefined;

  const activityRaw = obj.activity as any;
  const loginHistory = Array.isArray(activityRaw?.loginHistory)
    ? activityRaw.loginHistory
        .map((ts: unknown) => (typeof ts === 'number' && Number.isFinite(ts) ? ts : null))
        .filter((x: number | null) => x !== null) as number[]
    : undefined;

  const activity = loginHistory ? { loginHistory } : undefined;

  return {
    followers,
    following,
    pendingRequests,
    activity,
    processedAt,
  };
}

function computeStatsSafe(data: InstagramData | null): Stats | null {
  if (!data) return null;

  // Never assume arrays exist.
  const followers = Array.isArray(data.followers) ? data.followers : [];
  const following = Array.isArray(data.following) ? data.following : [];
  const pendingRequests = Array.isArray(data.pendingRequests) ? data.pendingRequests : [];

  const followerSet = new Set(followers);
  const followingSet = new Set(following);

  const mutuals = following.filter((u) => followerSet.has(u)).length;
  const notFollowingBack = following.filter((u) => !followerSet.has(u)).length;
  const dontFollowBack = followers.filter((u) => !followingSet.has(u)).length;

  return {
    totalFollowers: followers.length,
    totalFollowing: following.length,
    notFollowingBack,
    dontFollowBack,
    mutuals,
    pendingRequests: pendingRequests.length,
  };
}

function PieChart({ data }: { data: { value: number; color: string; label: string }[] }) {
  const size = width - 80;
  const r = size / 2 - 20;
  const cx = size / 2;
  const cy = size / 2;

  const total = data.reduce((s, d) => s + (Number.isFinite(d.value) ? d.value : 0), 0) || 1;

  let startAngle = -Math.PI / 2;
  const slices = data
    .filter((d) => (Number.isFinite(d.value) ? d.value : 0) > 0)
    .map((d) => {
      const angle = ((d.value || 0) / total) * 2 * Math.PI;
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
        <Path key={i} d={(s as any).path} fill={s.color} opacity={0.9} />
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
  }, [scaleAnim]);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
      style={{ flex: 1 }}
      disabled={!onPress}
    >
      <Animated.View
        style={[
          styles.statCard,
          { borderColor: color + '55', transform: [{ scale: scaleAnim }] },
        ]}
      >
        <View style={[styles.statIconWrap, { backgroundColor: color + '22' }]}>
          <Ionicons name={icon as any} size={22} color={color} />
        </View>
        <Text style={[styles.statValue, { color }]}>{(value ?? 0).toLocaleString()}</Text>
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

  const maxVal = Math.max(...bars.map((b) => (Number.isFinite(b.value) ? b.value : 0)), 1);
  const chartWidth = width - 80;
  const chartHeight = 140;
  const barWidth = (chartWidth / bars.length) * 0.55;
  const gapWidth = chartWidth / bars.length;

  return (
    <View style={styles.barChartWrap}>
      <Svg width={chartWidth} height={chartHeight + 30}>
        {bars.map((b, i) => {
          const barH = (((Number.isFinite(b.value) ? b.value : 0) / maxVal) * chartHeight) || 0;
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


function ErrorState({
  title,
  subtitle,
  onReset,
}: {
  title: string;
  subtitle: string;
  onReset: () => void;
}) {
  return (
    <View style={[styles.container, styles.center]}>
      <Ionicons name="alert-circle-outline" size={54} color="#FF5252" />
      <Text style={styles.noDataTitle}>{title}</Text>
      <Text style={styles.noDataSub}>{subtitle}</Text>
      <TouchableOpacity style={styles.importBtn} onPress={onReset}>
        <Text style={styles.importBtnText}>Reset Stored Data</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();

  const { loading, errorMsg, data, stats, mediaStore } = useInstagramAnalyticsData();

  const [activeTab, setActiveTab] = useState<TabKey>('overview');


  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (loading) return;
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [loading]);

  const clearData = async () => {
    try {
      await AsyncStorage.removeItem('instainsight_data');
      await AsyncStorage.removeItem('instainsight_media_v1');
      await AsyncStorage.removeItem('instainsight_media');
      await AsyncStorage.removeItem('instainsight_dna');
    } catch {
      // ignore
    }
    router.replace('/');
  };

  const processedDate = useMemo(() => {
    if (!data) return '—';
    const d = new Date(data.processedAt);
    return Number.isFinite(d.getTime())
      ? d.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';
  }, [data]);


  const mediaInsights = useMemo(() => {
    const stories = mediaStore?.stories;
    const posts = mediaStore?.posts;
    if (!stories && !posts) return null;

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    const allMonths = new Set<string>();
    if (stories) Object.keys(stories).forEach(m => allMonths.add(m));
    if (posts) Object.keys(posts).forEach(m => allMonths.add(m));

    // Most active month from stories
    let maxStories = 0;
    let maxMonth = '';
    if (stories) {
      Object.entries(stories).forEach(([month, items]) => {
        const count = items.length;
        if (count > maxStories) { maxStories = count; maxMonth = month; }
      });
    }

    const totalStories = stories ? Object.values(stories).reduce((a, b) => a + b.length, 0) : 0;
    const totalPosts = posts ? Object.values(posts).reduce((a, b) => a + b.length, 0) : 0;
    const monthsWithData = allMonths.size;

    let activeLabel = '—';
    if (maxMonth) {
      const [y, m] = maxMonth.split('-');
      activeLabel = `${monthNames[+m - 1]}'${y.slice(2)} (${maxStories} stories)`;
    }

    return { totalStories, totalPosts, monthsWithData, activeLabel };
  }, [mediaStore]);

  const mostActiveMonthLabel = mediaInsights?.activeLabel ?? '—';


  const pieData = useMemo(() => {
    if (!stats) return [];
    return [
      { label: 'Mutuals', value: stats.mutuals, color: '#00BCD4' },
      { label: 'Not Following Back', value: stats.notFollowingBack, color: '#FF5252' },
      { label: "Don't Follow Back", value: stats.dontFollowBack, color: '#FFC107' },
    ];
  }, [stats]);

  const analytics: Analytics | null = useMemo(() => {
    if (!data) return null;

    const toUsers = (names: string[]) => names.map((u) => ({ username: u }));

    return buildAnalytics({
      followers: toUsers(data.followers),
      following: toUsers(data.following),
      pending: toUsers(data.pendingRequests ?? []),
      blocked: toUsers(data.blocked ?? []),
      restricted: toUsers(data.restricted ?? []),
      closeFriends: toUsers(data.closeFriends ?? []),
      recentlyUnfollowed: toUsers(data.recentlyUnfollowed ?? []),
      removedSuggestions: toUsers(data.removedSuggestions ?? []),
      recentFollowRequests: toUsers(data.recentRequests ?? []),
      hashtags: data.hashtags ?? [],
    });
  }, [data]);

  const activityData: ActivityData | null = useMemo(() => {
    if (!data) return null;

    const loginHistoryRaw = data.activity?.loginHistory ?? [];
    const mappedLogins = loginHistoryRaw.map((item: any) => {
      if (typeof item === 'number' && Number.isFinite(item)) {
        const d = new Date(item);
        const time = Number.isFinite(d.getTime())
          ? d.toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' })
          : 'Unknown';
        return { time, device:'Unknown', ip:'', monthKey:'' };
      }
      if (item && typeof item === 'object') {
        const monthKey = typeof item.monthKey === 'string' ? item.monthKey : '';
        const time = typeof item.time === 'string' ? item.time : 'Unknown';
        return {
          time,
          device: typeof item.device === 'string' ? item.device : 'Unknown',
          ip: typeof item.ip === 'string' ? item.ip : '',
          monthKey: monthKey || extractMonthKey(time),
        };
      }
      return null;
    }).filter(Boolean) as { time: string; device: string; ip: string; monthKey: string }[];

    const topCombined = data.engagement?.topCombined?.map(u => ({
      user: u.user,
      total: u.total,
      likedPosts: u.likedPosts,
      likedComments: u.likedComments,
      commented: 0,
    })) ?? [];

    // Build timeline from stored data or derive from login entries
    let timeline: any[] = (data.activity?.timeline ?? []).map((t: any) => ({
      month: t.month || '',
      label: t.label || '',
      postComments: typeof t.postComments === 'number' ? t.postComments : 0,
      reelComments: typeof t.reelComments === 'number' ? t.reelComments : 0,
      polls: typeof t.polls === 'number' ? t.polls : 0,
      questions: typeof t.questions === 'number' ? t.questions : 0,
      logins: typeof t.logins === 'number' ? t.logins : 0,
      likedPosts: typeof t.likedPosts === 'number' ? t.likedPosts : 0,
    }));
    if (timeline.length === 0 && mappedLogins.length > 0) {
      const monthly: Record<string, number> = {};
      for (const l of mappedLogins) {
        if (l.monthKey) monthly[l.monthKey] = (monthly[l.monthKey] || 0) + 1;
      }
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      timeline = Object.entries(monthly)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-8)
        .map(([mk, count]) => {
          const [y, m] = mk.split('-');
          return {
            month: mk,
            label: `${monthNames[parseInt(m) - 1]}'${y.slice(2)}`,
            postComments: 0, reelComments: 0, polls: 0, questions: 0, logins: count, likedPosts: 0,
          };
        });
    }

    const deviceCounts = data.activity?.deviceCounts ?? {};

    // Sum from timeline if available, else use stored totals
    const timelineTotals = (data.timeline ?? data.activity?.timeline ?? []).reduce(
      (acc: any, m: any) => ({
        postComments: acc.postComments + (m.postComments || 0),
        reelComments: acc.reelComments + (m.reelComments || 0),
        polls: acc.polls + (m.polls || 0),
        questions: acc.questions + (m.questions || 0),
      }),
      { postComments: 0, reelComments: 0, polls: 0, questions: 0 },
    );

    const raw = {
      summary: {
        totalLogins: mappedLogins.length,
        totalPostComments: timelineTotals.postComments,
        totalReelComments: timelineTotals.reelComments,
        totalPolls: data.polls?.total ?? timelineTotals.polls,
        totalQuestions: data.questions?.total ?? timelineTotals.questions,
        totalLikedPosts: data.engagement?.totalLikes ?? 0,
        totalLikedComments: data.engagement?.totalComments ?? 0,
      },
      loginHistory: mappedLogins,
      deviceCounts,
      timeline,
      topLikedPostUsers: data.engagement?.topLikes?.map(u => ({ user: u.user, count: u.count })) ?? [],
      topLikedCmtUsers: [],
      topCommentedOn: [],
      topCombined,
      storiesCount: mediaInsights?.totalStories ?? 0,
      postsCount: mediaInsights?.totalPosts ?? 0,
      mostActiveMonth: mediaInsights?.activeLabel,
    };

    return toActivityData(raw as any);
  }, [data, mediaInsights]);


  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#E040FB" />
      </View>
    );
  }

  if (errorMsg) {
    return <ErrorState title="Dashboard Error" subtitle={errorMsg} onReset={clearData} />;
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


  const openGallery = () => router.push('/gallery');
  const openStories = () => router.push('/stories');
  const openDna = () => router.push('/dna');


  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0F0F1A', '#1A0A2E', '#0F0F1A']}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.tabBar}>
        {(['overview', 'engagement', 'activity'] as const).map((tab) => (
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
            {activeTab === 'overview'
                ? 'Overview'
                : activeTab === 'engagement'
                  ? 'Engagement'
                  : 'Activity'}

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
            <View style={styles.mediaStatChip}>
              <Text style={styles.mediaStatValue}>{mediaInsights?.totalStories ?? 0}</Text>
              <Text style={styles.mediaStatLabel}>Stories</Text>
            </View>
            <View style={styles.mediaStatChip}>
              <Text style={styles.mediaStatValue}>{mediaInsights?.totalPosts ?? 0}</Text>
              <Text style={styles.mediaStatLabel}>Posts</Text>
            </View>
            <View style={styles.mediaStatChip}>
              <Text style={styles.mediaStatValue}>{mediaInsights?.monthsWithData ?? 0}</Text>
              <Text style={styles.mediaStatLabel}>Months</Text>
            </View>
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

            <TouchableOpacity
              style={[styles.mediaBtn, { borderColor: '#FFC10755' }]}
              onPress={openDna}
              activeOpacity={0.85}
            >
              <Ionicons name="git-network-outline" size={18} color="#FFC107" />
              <Text style={[styles.mediaBtnText, { color: '#FFC107' }]}>DNA</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Overview tab */}
        {activeTab === 'overview' && (
          <>
            <View style={styles.statsGrid}>
              <StatCard label="Followers" value={stats.totalFollowers} icon="people" color="#E040FB" />
              <StatCard label="Following" value={stats.totalFollowing} icon="person-add" color="#7C4DFF" />
            </View>

            <View style={styles.statsGrid}>
              <StatCard
                label="Not Following Back"
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
                label="Pending Requests"
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
            </View>

            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Overview Comparison</Text>
              <BarChart stats={stats} />
            </View>

            {/* All other analytics categories as scrollable cards */}
            <View style={styles.actionsCard}>
              <Text style={styles.chartTitle}>More Insights</Text>
              <Text style={styles.cardSub}>Open lists to explore each category</Text>

              <View style={styles.moreCardsWrap}>
                {analytics ? (
                  <>
                    <CategoryCard
                      title="You Don't Follow Back"
                      value={analytics.fans.count}
                      color="#FFC107"
                      icon="eye-off"
                      listType="dontfollowback"
                      onPress={() => router.push({ pathname: '/userlist', params: { type: 'dontfollowback' } })}
                    />
                    <CategoryCard
                      title="Blocked"
                      value={analytics.blocked.count}
                      color="#FF5252"
                      icon="stop-circle-outline"
                      listType="blocked"
                      onPress={() => router.push({ pathname: '/userlist', params: { type: 'blocked' } })}
                    />
                    <CategoryCard
                      title="Restricted"
                      value={analytics.restricted.count}
                      color="#E040FB"
                      icon="lock-closed-outline"
                      listType="restricted"
                      onPress={() => router.push({ pathname: '/userlist', params: { type: 'restricted' } })}
                    />
                    <CategoryCard
                      title="Close Friends"
                      value={analytics.closeFriends.count}
                      color="#00BCD4"
                      icon="person-add-outline"
                      listType="closefriends"
                      onPress={() => router.push({ pathname: '/userlist', params: { type: 'closefriends' } })}
                    />
                    <CategoryCard
                      title="Recently Unfollowed"
                      value={analytics.recentlyUnfollowed.count}
                      color="#7C4DFF"
                      icon="person-remove-outline"
                      listType="recentlyunfollowed"
                      onPress={() => router.push({ pathname: '/userlist', params: { type: 'recentlyunfollowed' } })}
                    />
                    <CategoryCard
                      title="Removed Suggestions"
                      value={analytics.removedSuggestions.count}
                      color="#9E9E9E"
                      icon="trash-outline"
                      listType="removedsuggestions"
                      onPress={() => router.push({ pathname: '/userlist', params: { type: 'removedsuggestions' } })}
                    />
                    <CategoryCard
                      title="Recent Follow Requests"
                      value={analytics.recentFollowRequests.count}
                      color="#FFC107"
                      icon="time-outline"
                      listType="recentfollowrequests"
                      onPress={() => router.push({ pathname: '/userlist', params: { type: 'recentfollowrequests' } })}
                    />
                    <CategoryCard
                      title="Hashtags"
                      value={analytics.hashtags.count}
                      color="#E91E63"
                      icon="hash"
                      listType="hashtags"
                      onPress={() => router.push({ pathname: '/userlist', params: { type: 'hashtags' } })}
                    />
                  </>
                ) : (
                  <Text style={styles.emptyNote}>No analytics categories available.</Text>
                )}
              </View>
            </View>
          </>
        )}


        {/* Engagement tab */}
        {activeTab === 'engagement' && (
          <View style={styles.fadeContainer}>
            <View style={styles.statsGrid}>
              <StatCard
                label="Total Liked Posts"
                value={data.engagement?.totalLikes ?? 0}
                icon="heart"
                color="#E91E63"
              />
              <StatCard
                label="Total Comments"
                value={data.engagement?.totalComments ?? 0}
                icon="chatbubble"
                color="#2196F3"
              />
            </View>

            <View style={styles.actionsCard}>
              <Text style={styles.chartTitle}>🏆 Top Interacted Users</Text>
              <Text style={styles.cardSub}>Based on your likes and comments</Text>

              {Array.isArray(data.engagement?.topLikes) && data.engagement?.topLikes?.length ? (
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

        {/* Activity tab */}
        {activeTab === 'activity' && activityData && (
          <ActivityScreen activity={activityData} />
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

  moreCardsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  moreCard: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  moreCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  moreCardTitle: { color: '#fff', fontSize: 12, fontWeight: '700' },
  moreCardValue: { color: '#888', fontSize: 12, fontWeight: '700', marginTop: 4 },

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
  mediaIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E040FB33',
    overflow: 'hidden',
  },
  mediaIconGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mediaTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  mediaSubtitle: { color: '#888', fontSize: 12, marginTop: 3 },

  mediaStatsGrid: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  mediaStatChip: {
    flex: 1, backgroundColor: '#0F0F1A', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#2A2A40', alignItems: 'center', gap: 4,
  },
  mediaStatValue: { fontSize: 18, fontWeight: '800', color: '#fff' },
  mediaStatLabel: { fontSize: 11, color: '#888', fontWeight: '600' },
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
  statIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  chartTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
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
});

