// app/dna.tsx — Instagram DNA Screen with 4 sub-tabs
import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useDnaData } from '@/hooks/useDnaData';
import type { DnaData } from '@/utils/dnaParser';

const { width } = Dimensions.get('window');
const TAB_NAMES = ['Timeline', 'Social Graph', 'Curiosity Map', 'Identity'] as const;
type DnaTab = (typeof TAB_NAMES)[number];

// ─── Stat Chip ───────────────────────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <View style={[chipStyles.chip, { borderColor: color + '44' }]}>
      <Text style={[chipStyles.value, { color }]}>{typeof value === 'number' ? value.toLocaleString() : value}</Text>
      <Text style={chipStyles.label}>{label}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#13131F',
    alignItems: 'center',
    gap: 2,
  },
  value: { fontSize: 18, fontWeight: '800' },
  label: { fontSize: 10, color: '#888', fontWeight: '600' },
});

// ─── Section Card ────────────────────────────────────────────────────────────

function SectionCard({ title, children, icon, color }: { title: string; children: React.ReactNode; icon?: string; color?: string }) {
  return (
    <View style={crdStyles.card}>
      {icon && (
        <View style={crdStyles.header}>
          <Ionicons name={icon as any} size={16} color={color ?? '#E040FB'} />
          <Text style={crdStyles.title}>{title}</Text>
        </View>
      )}
      {children}
    </View>
  );
}

const crdStyles = StyleSheet.create({
  card: { backgroundColor: '#1A1A2E', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#2A2A40', marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  title: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

// ─── Peak Hour Radial ────────────────────────────────────────────────────────

function PeakHourRadial({ hour, peak }: { hour: string; peak: number }) {
  const size = 100;
  const cx = size / 2;
  const cy = size / 2;
  const r = 40;
  const circumference = 2 * Math.PI * r;
  const fraction = peak / 100;
  const strokeDashoffset = circumference * (1 - fraction);

  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} stroke="#2A2A40" strokeWidth={8} fill="none" />
        <Circle
          cx={cx} cy={cy} r={r}
          stroke="#E040FB"
          strokeWidth={8}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          opacity={0.85}
        />
        <SvgText x={cx} y={cy - 4} fontSize={13} fontWeight="800" fill="#fff" textAnchor="middle">
          {hour}
        </SvgText>
        <SvgText x={cx} y={cy + 14} fontSize={9} fill="#888" textAnchor="middle">
          Peak
        </SvgText>
      </Svg>
      <Text style={{ color: '#888', fontSize: 11 }}>{Math.round(peak * 100)}% of activity</Text>
    </View>
  );
}

// ─── Timeline Tab ────────────────────────────────────────────────────────────

const TimelineTab = React.memo(({ data }: { data: DnaData }) => {
  const { timeline } = data;

  const sortedDaily = useMemo(() => {
    return timeline.dailyActivity.slice(-90);
  }, [timeline.dailyActivity]);

  const hasStoriesOrPosts = timeline.totalStories > 0 || timeline.totalPosts > 0;

  if (!hasStoriesOrPosts) {
    return (
      <View style={{ padding: 20 }}>
        <SectionCard title="Media Activity" icon="images-outline" color="#E040FB">
          <Text style={{ color: '#666', fontSize: 14, textAlign: 'center', marginVertical: 20 }}>
            No media data found in your export.
          </Text>
        </SectionCard>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      {/* Stats row */}
      <SectionCard title="Activity Overview" icon="pulse-outline" color="#E040FB">
        <View style={styles.chipRow}>
          <StatChip label="Stories" value={timeline.totalStories} color="#E040FB" />
          <StatChip label="Posts" value={timeline.totalPosts} color="#7C4DFF" />
          <StatChip label="Reposts" value={timeline.totalReposts} color="#00BCD4" />
        </View>
      </SectionCard>

      {/* Streak + Peak Hour */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={[styles.streakCard, { flex: 1 }]}>
          <Ionicons name="flame" size={22} color="#FF6B35" />
          <Text style={styles.streakValue}>{timeline.longestStreak}</Text>
          <Text style={styles.streakLabel}>Day Streak</Text>
        </View>
        <View style={[styles.streakCard, { flex: 1 }]}>
          <Ionicons name="timer" size={22} color="#E040FB" />
          <Text style={styles.streakValue}>{timeline.mostActiveMonth}</Text>
          <Text style={styles.streakLabel}>Most Active Month</Text>
        </View>
      </View>

      {/* Peak Hour Radial */}
      <SectionCard title="Peak Activity Time" icon="time-outline" color="#E040FB">
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }}>
          <PeakHourRadial hour={timeline.peakHour} peak={0.72} />
          <View style={{ gap: 8 }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{timeline.peakHour}</Text>
            <Text style={{ color: '#888', fontSize: 11 }}>Most active time{'\n'}across all media</Text>
          </View>
        </View>
      </SectionCard>

      {/* Daily Activity Heatmap */}
      {sortedDaily.length > 0 && (
        <SectionCard title="Recent Activity (Last 90 Days)" icon="grid-outline" color="#00E676">
          <HeatmapGrid data={sortedDaily} />
        </SectionCard>
      )}

      {/* Timeline bars */}
      <SectionCard title="Activity Timeline" icon="bar-chart-outline" color="#7C4DFF">
        <ActivityTimelineChart daily={sortedDaily} />
      </SectionCard>
    </ScrollView>
  );
});

// ─── Heatmap Grid ────────────────────────────────────────────────────────────

function HeatmapGrid({ data }: { data: { date: string; stories: number; posts: number; reposts: number }[] }) {
  const [selected, setSelected] = React.useState<{ date: string; stories: number; posts: number; reposts: number } | null>(null);

  const maxVal = useMemo(() => Math.max(...data.map(d => d.stories + d.posts + d.reposts), 1), [data]);
  const cellSize = Math.min(Math.floor((width - 80) / 15), 18);
  const weeks = Math.ceil(data.length / 7);

  const getIntensity = (val: number): string => {
    const ratio = val / maxVal;
    if (ratio === 0) return '#1A1A2E';
    if (ratio < 0.25) return '#2A1A4E';
    if (ratio < 0.5) return '#4A1A7E';
    if (ratio < 0.75) return '#7A1ABE';
    return '#E040FB';
  };

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={Math.min(weeks * (cellSize + 3) + 4, width - 60)} height={7 * (cellSize + 3) + 4}>
        {data.slice(0, weeks * 7).map((d, i) => {
          const week = Math.floor(i / 7);
          const day = i % 7;
          const total = d.stories + d.posts + d.reposts;
          return (
            <Rect
              key={d.date}
              x={week * (cellSize + 3) + 2}
              y={day * (cellSize + 3) + 2}
              width={cellSize}
              height={cellSize}
              rx={2}
              fill={getIntensity(total)}
              onPress={() => setSelected(selected?.date === d.date ? null : d)}
            />
          );
        })}
      </Svg>
      <View style={{ flexDirection: 'row', gap: 4, marginTop: 8, alignItems: 'center' }}>
        <Text style={{ color: '#666', fontSize: 10 }}>Less</Text>
        {['#1A1A2E', '#2A1A4E', '#4A1A7E', '#7A1ABE', '#E040FB'].map(c => (
          <View key={c} style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c }} />
        ))}
        <Text style={{ color: '#666', fontSize: 10 }}>More</Text>
      </View>
      {selected && (
        <View style={heatPopupStyles.popup}>
          <Text style={heatPopupStyles.date}>{selected.date}</Text>
          <View style={heatPopupStyles.row}>
            <View style={[heatPopupStyles.dot, { backgroundColor: '#E040FB' }]} />
            <Text style={heatPopupStyles.label}>Stories: <Text style={heatPopupStyles.value}>{selected.stories}</Text></Text>
          </View>
          <View style={heatPopupStyles.row}>
            <View style={[heatPopupStyles.dot, { backgroundColor: '#7C4DFF' }]} />
            <Text style={heatPopupStyles.label}>Posts: <Text style={heatPopupStyles.value}>{selected.posts}</Text></Text>
          </View>
          <View style={heatPopupStyles.row}>
            <View style={[heatPopupStyles.dot, { backgroundColor: '#00BCD4' }]} />
            <Text style={heatPopupStyles.label}>Reposts: <Text style={heatPopupStyles.value}>{selected.reposts}</Text></Text>
          </View>
        </View>
      )}
    </View>
  );
}

const heatPopupStyles = StyleSheet.create({
  popup: {
    marginTop: 12,
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A40',
    padding: 14,
    width: '100%',
    gap: 6,
  },
  date: { color: '#fff', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: '#aaa', fontSize: 12 },
  value: { color: '#fff', fontWeight: '700' },
});

// ─── Activity Timeline Bar Chart ─────────────────────────────────────────────

function ActivityTimelineChart({ daily }: { daily: { date: string; stories: number; posts: number; reposts: number }[] }) {
  const chartW = width - 80;
  const chartH = 120;
  const barCount = Math.min(daily.length, 30);
  const sliced = daily.slice(-barCount);
  const maxVal = Math.max(...sliced.map(d => d.stories + d.posts + d.reposts), 1);
  const barW = Math.max(4, (chartW - barCount * 2) / barCount);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const labelInterval = Math.max(1, Math.floor(barCount / 8));

  return (
    <Svg width={chartW} height={chartH + 28}>
      {sliced.map((d, i) => {
        const x = i * (barW + 2);
        const h = ((d.stories + d.posts + d.reposts) / maxVal) * chartH;
        return (
          <Rect key={d.date} x={x} y={chartH - h} width={barW} height={h || 1} fill="#7C4DFF" rx={1} opacity={0.8} />
        );
      })}
      {sliced.map((d, i) => {
        if (i % labelInterval !== 0) return null;
        const x = i * (barW + 2) + barW / 2;
        return (
          <SvgText key={`lbl-${d.date}`} x={x} y={chartH + 16} fontSize={8} fill="#888" textAnchor="middle">
            {formatDate(d.date)}
          </SvgText>
        );
      })}
    </Svg>
  );
}

// ─── Social Graph Tab ────────────────────────────────────────────────────────

const SocialGraphTab = React.memo(({ data }: { data: DnaData }) => {
  const { socialGraph } = data;
  const topPeople = useMemo(() => socialGraph.topPeople.slice(0, 10), [socialGraph.topPeople]);

  if (!socialGraph.totalChats) {
    return (
      <View style={{ padding: 20 }}>
        <SectionCard title="Message Network" icon="chatbubbles-outline" color="#00E676">
          <Text style={{ color: '#666', fontSize: 14, textAlign: 'center', marginVertical: 20 }}>
            No message data found. Check that your export contains a messages/inbox/ folder.
          </Text>
        </SectionCard>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <SectionCard title="Network Overview" icon="people-outline" color="#00E676">
        <View style={styles.chipRow}>
          <StatChip label="Chats" value={socialGraph.totalChats} color="#00E676" />
          <StatChip label="Unique People" value={socialGraph.totalUniquePeople} color="#7C4DFF" />
          <StatChip label="Peak Chat Time" value={socialGraph.peakChatHour} color="#E040FB" />
        </View>
      </SectionCard>

      {topPeople.length > 0 && (
        <SectionCard title="Top Contacts" icon="chatbubbles-outline" color="#00E676">
          {topPeople.map((p, i) => (
            <View key={p.user} style={styles.contactRow}>
              <View style={[styles.contactAvatar, { backgroundColor: `hsl(${i * 36}, 70%, 30%)` }]}>
                <Text style={styles.contactInitials}>{p.user.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.contactName}>@{p.user}</Text>
              <View style={styles.contactBarTrack}>
                <View
                  style={[
                    styles.contactBarFill,
                    { width: `${Math.min((p.count / topPeople[0].count) * 100, 100)}%`, backgroundColor: '#00E676' },
                  ]}
                />
              </View>
              <Text style={styles.contactCount}>{p.count}</Text>
            </View>
          ))}
        </SectionCard>
      )}

      {socialGraph.monthlyMessages.length > 0 && (
        <SectionCard title="Message Frequency" icon="bar-chart-outline" color="#00E676">
          <MessageChart data={socialGraph.monthlyMessages} />
        </SectionCard>
      )}
    </ScrollView>
  );
});

// ─── Contact Row ─────────────────────────────────────────────────────────────

// ─── Message Frequency Chart ──────────────────────────────────────────────────

function MessageChart({ data }: { data: { month: string; count: number }[] }) {
  const chartW = width - 80;
  const chartH = 130;
  const sliced = data.slice(-12);
  const maxVal = Math.max(...sliced.map(d => d.count), 1);
  const barW = Math.max(6, (chartW - sliced.length * 4) / sliced.length);

  return (
    <Svg width={chartW} height={chartH + 30}>
      {sliced.map((m, i) => {
        const x = i * (barW + 4);
        const h = (m.count / maxVal) * chartH;
        return (
          <G key={m.month}>
            <Rect x={x} y={chartH - h} width={barW} height={h || 1} fill="#00E676" rx={2} opacity={0.8} />
            <SvgText x={x + barW / 2} y={chartH + 16} fontSize={7} fill="#888" textAnchor="middle">
              {m.month.slice(5)}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ─── Curiosity Map Tab ───────────────────────────────────────────────────────

const CuriosityMapTab = React.memo(({ data }: { data: DnaData }) => {
  const { curiosity } = data;
  const hasData = curiosity.topProfiles.length > 0 || curiosity.topWords.length > 0 || curiosity.topDomains.length > 0;

  if (!hasData) {
    return (
      <View style={{ padding: 20 }}>
        <SectionCard title="Curiosity Map" icon="search-outline" color="#FFC107">
          <Text style={{ color: '#666', fontSize: 14, textAlign: 'center', marginVertical: 20 }}>
            No search or link data found in your export.
          </Text>
        </SectionCard>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      {curiosity.topProfiles.length > 0 && (
        <SectionCard title="Top Searched Profiles" icon="person-search-outline" color="#FFC107">
          {curiosity.topProfiles.slice(0, 10).map((p, i) => (
            <View key={p.user} style={styles.searchRow}>
              <Text style={[styles.searchRank, { color: '#FFC107' }]}>#{i + 1}</Text>
              <Text style={styles.searchName}>@{p.user}</Text>
              <Text style={styles.searchCount}>{p.count}×</Text>
            </View>
          ))}
        </SectionCard>
      )}

      {curiosity.topWords.length > 0 && (
        <SectionCard title="Top Search Words" icon="text-outline" color="#E040FB">
          <WordCloud words={curiosity.topWords.slice(0, 30)} />
        </SectionCard>
      )}

      {curiosity.topDomains.length > 0 && (
        <SectionCard title="Clicked Domains" icon="link-outline" color="#00BCD4">
          <DomainDonut domains={curiosity.topDomains} />
        </SectionCard>
      )}
    </ScrollView>
  );
});

// ─── Word Cloud ──────────────────────────────────────────────────────────────

function WordCloud({ words }: { words: { word: string; count: number }[] }) {
  const maxCount = Math.max(...words.map(w => w.count), 1);
  const colors = ['#E040FB', '#FFC107', '#00E676', '#7C4DFF', '#FF5252', '#00BCD4', '#FF6B35'];

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', paddingVertical: 8 }}>
      {words.map((w, i) => {
        const ratio = w.count / maxCount;
        const fontSize = 11 + ratio * 16;
        return (
          <Text
            key={w.word}
            style={{
              fontSize: Math.min(fontSize, 28),
              color: colors[i % colors.length],
              fontWeight: ratio > 0.5 ? '700' : '500',
              opacity: 0.5 + ratio * 0.5,
            }}
          >
            {w.word}
          </Text>
        );
      })}
    </View>
  );
}

// ─── Domain Donut Chart ──────────────────────────────────────────────────────

function DomainDonut({ domains }: { domains: { domain: string; count: number }[] }) {
  const total = domains.reduce((s, d) => s + d.count, 0) || 1;
  const colors = ['#00BCD4', '#E040FB', '#FFC107', '#7C4DFF', '#00E676', '#FF5252', '#FF6B35'];

  let startAngle = 0;
  const segments = domains.slice(0, 7).map((d, i) => {
    const angle = (d.count / total) * 360;
    const seg = { ...d, angle, startAngle, color: colors[i] };
    startAngle += angle;
    return seg;
  });

  const cx = 50;
  const cy = 50;
  const r = 40;

  return (
    <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
      <Svg width={100} height={100}>
        {segments.map((s, i) => {
          const a1 = (s.startAngle * Math.PI) / 180;
          const a2 = ((s.startAngle + s.angle) * Math.PI) / 180;
          const x1 = cx + r * Math.cos(a1);
          const y1 = cy + r * Math.sin(a1);
          const x2 = cx + r * Math.cos(a2);
          const y2 = cy + r * Math.sin(a2);
          const large = s.angle > 180 ? 1 : 0;
          const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
          return <Path key={s.domain} d={path} fill={s.color} opacity={0.85} />;
        })}
        <Rect x={38} y={38} width={24} height={24} rx={12} fill="#13131F" />
      </Svg>
      <View style={{ gap: 4, flex: 1 }}>
        {segments.map((s, i) => (
          <View key={s.domain} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
            <Text style={{ color: '#aaa', fontSize: 11, flex: 1 }} numberOfLines={1}>{s.domain}</Text>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{Math.round(s.angle / 3.6)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Identity Tab ────────────────────────────────────────────────────────────

const IdentityTab = React.memo(({ data }: { data: DnaData }) => {
  const { identity } = data;
  const recentChanges = useMemo(() => identity.changeTimeline.slice(-20), [identity.changeTimeline]);

  const changeTypeIcons: Record<string, string> = {
    username: 'at-outline',
    bio: 'document-text-outline',
    photo: 'image-outline',
    name: 'person-outline',
    website: 'link-outline',
    private: 'lock-closed-outline',
  };

  const changeTypeColors: Record<string, string> = {
    username: '#FFC107',
    bio: '#00E676',
    photo: '#E040FB',
    name: '#7C4DFF',
    website: '#00BCD4',
    private: '#FF5252',
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <SectionCard title="Profile Identity" icon="person-outline" color="#7C4DFF">
        <View style={styles.chipRow}>
          <StatChip label="Total Changes" value={identity.totalChanges} color="#7C4DFF" />
          <StatChip label="Changes Logged" value={identity.changeTimeline.length} color="#00E676" />
          <StatChip label="Account Age" value={identity.accountAgeDays > 0 ? `${identity.accountAgeDays}d` : '—'} color="#E040FB" />
        </View>
      </SectionCard>

      {recentChanges.length > 0 && (
        <SectionCard title="Change History" icon="time-outline" color="#7C4DFF">
          {recentChanges.slice().reverse().map((c, i) => {
            const icon = changeTypeIcons[c.type] || 'pencil-outline';
            const color = changeTypeColors[c.type] || '#888';
            return (
              <View key={i} style={styles.changeRow}>
                <View style={[styles.changeIconWrap, { backgroundColor: color + '22' }]}>
                  <Ionicons name={icon as any} size={14} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.changeType}>{c.type.charAt(0).toUpperCase() + c.type.slice(1)}</Text>
                  <Text style={styles.changeDetail} numberOfLines={1}>
                    {c.old ? `${c.old} → ${c.new}` : c.new}
                  </Text>
                </View>
                <Text style={styles.changeDate}>{new Date(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
              </View>
            );
          })}
        </SectionCard>
      )}

      {recentChanges.length === 0 && (
        <SectionCard title="Change History" icon="time-outline" color="#7C4DFF">
          <Text style={{ color: '#666', fontSize: 14, textAlign: 'center', marginVertical: 20 }}>
            No profile change history found in your export.
          </Text>
        </SectionCard>
      )}
    </ScrollView>
  );
});

// ─── Tab Content ─────────────────────────────────────────────────────────────

function TabContent({ tab, dnaData }: { tab: DnaTab; dnaData: DnaData }) {
  switch (tab) {
    case 'Timeline':
      return <TimelineTab data={dnaData} />;
    case 'Social Graph':
      return <SocialGraphTab data={dnaData} />;
    case 'Curiosity Map':
      return <CuriosityMapTab data={dnaData} />;
    case 'Identity':
      return <IdentityTab data={dnaData} />;
  }
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function DnaScreen() {
  const { loading, error, dnaData, hasDnaData } = useDnaData();
  const [activeTab, setActiveTab] = useState<DnaTab>('Timeline');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#E040FB" />
        <Text style={{ color: '#888', marginTop: 12, fontSize: 13 }}>Loading DNA data...</Text>
      </View>
    );
  }

  if (error || !hasDnaData) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <Ionicons name="git-network-outline" size={54} color="#444" />
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 16 }}>No DNA Data Yet</Text>
        <Text style={{ color: '#888', fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
          Import your Instagram ZIP to generate your activity DNA.{'\n'}Make sure it includes media and search data.
        </Text>
        <Text style={{ color: '#666', fontSize: 11, marginTop: 12 }}>{error || ''}</Text>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {TAB_NAMES.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TabContent tab={activeTab} dnaData={dnaData!} />
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F1A' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1A1A2E',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A40',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#13131F',
  },
  activeTab: { backgroundColor: '#2A1A4E' },
  tabText: { color: '#666', fontSize: 11, fontWeight: '700' },
  activeTabText: { color: '#E040FB' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  streakCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A40',
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    gap: 6,
  },
  streakValue: { color: '#fff', fontSize: 20, fontWeight: '800' },
  streakLabel: { color: '#888', fontSize: 11, fontWeight: '600' },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A4044',
  },
  contactAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactInitials: { color: '#fff', fontSize: 12, fontWeight: '800' },
  contactName: { color: '#fff', fontSize: 13, fontWeight: '600', flex: 1 },
  contactBarTrack: {
    width: 50,
    height: 6,
    backgroundColor: '#2A2A40',
    borderRadius: 3,
    overflow: 'hidden',
  },
  contactBarFill: { height: '100%', borderRadius: 3 },
  contactCount: { color: '#00E676', fontSize: 12, fontWeight: '800', width: 32, textAlign: 'right' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A4044',
  },
  searchRank: { fontSize: 12, fontWeight: '800', width: 28 },
  searchName: { color: '#fff', fontSize: 13, fontWeight: '600', flex: 1 },
  searchCount: { color: '#FFC107', fontSize: 12, fontWeight: '700' },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A4044',
  },
  changeIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeType: { color: '#fff', fontSize: 13, fontWeight: '600' },
  changeDetail: { color: '#888', fontSize: 11, marginTop: 1 },
  changeDate: { color: '#666', fontSize: 10, width: 60, textAlign: 'right' },
});
