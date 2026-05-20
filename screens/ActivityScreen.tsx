import React, { useMemo, useRef, useEffect } from 'react';
import {
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { G, Path, Rect, Text as SvgText } from 'react-native-svg';

export type TopUser = {
  rank: number;
  name: string;
  sub: string;
  count: number;
  color: string;
  colorA: string;
  initials: string;
};

export type MonthBar = {
  month: string;
  comments: number;
  polls: number;
  qa: number;
  logins: number;
};

export type DeviceCount = {
  name: string;
  count: number;
  pct: number;
};

export type LoginEntry = {
  time: string;
  ip: string;
  device: 'Phone' | 'Desktop' | 'Tablet' | 'Unknown';
};

export type ActivityData = {
  storiesCount: number;
  postsCount: number;
  activeMonths: number;
  mostActiveMonth: string;
  topUsers: TopUser[];
  monthlyBars: MonthBar[];
  totalSessions: number;
  devicesUsed: number;
  mostActiveLoginMonth: string;
  deviceBreakdown: DeviceCount[];
  loginHistory: LoginEntry[];
};

const { width } = Dimensions.get('window');

function TopUserCard({ user, index }: { user: TopUser; index: number }) {
  const barWidth = ((user.count / 500) * (width - 120));

  return (
    <View style={usrStyles.row}>
      <View style={[usrStyles.avatar, { backgroundColor: user.colorA, borderColor: user.color }]}>
        <Text style={[usrStyles.avatarText, { color: user.color }]}>{user.initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={usrStyles.rankBadge}>#{user.rank}</Text>
          <Text style={usrStyles.name}>@{user.name}</Text>
        </View>
        <Text style={usrStyles.sub}>{user.sub}</Text>
      </View>
      <View style={usrStyles.barTrack}>
        <View style={[usrStyles.barFill, { width: Math.min(barWidth, width - 120), backgroundColor: user.color }]} />
      </View>
      <Text style={[usrStyles.count, { color: user.color }]}>{user.count}</Text>
    </View>
  );
}

const usrStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A4044',
    gap: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '800' },
  rankBadge: { color: '#E040FB', fontSize: 11, fontWeight: '800' },
  name: { color: '#fff', fontSize: 14, fontWeight: '600' },
  sub: { color: '#888', fontSize: 11, marginTop: 1 },
  barTrack: {
    width: 60,
    height: 8,
    backgroundColor: '#2A2A40',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4 },
  count: { fontSize: 13, fontWeight: '800', width: 36, textAlign: 'right' },
});

function MonthlyChart({ bars }: { bars: MonthBar[] }) {
  const chartW = width - 80;
  const chartH = 150;
  const barGap = 6;

  if (!bars.length) return null;

  const maxVal = bars.reduce((m, b) => Math.max(m, b.comments, b.polls, b.qa, b.logins), 1);

  const barW = Math.max(8, (chartW - (bars.length - 1) * barGap) / bars.length - 2);

  return (
    <Svg width={chartW} height={chartH + 30}>
      {bars.map((b, i) => {
        const x = i * (barW + barGap);
        const h1 = (b.comments / maxVal) * chartH;
        const h2 = (b.polls / maxVal) * chartH;
        const h3 = (b.qa / maxVal) * chartH;
        const h4 = (b.logins / maxVal) * chartH;

        return (
          <G key={i}>
            <Rect x={x} y={chartH - h1} width={barW} height={h1 || 1} fill="#E91E63" rx={2} opacity={0.85} />
            <Rect x={x} y={chartH - h1 - h2} width={barW} height={h2 || 1} fill="#FFC107" rx={2} opacity={0.85} />
            <Rect x={x} y={chartH - h1 - h2 - h3} width={barW} height={h3 || 1} fill="#7C4DFF" rx={2} opacity={0.85} />
            <Rect x={x} y={chartH - h1 - h2 - h3 - h4} width={barW} height={h4 || 1} fill="#00E676" rx={2} opacity={0.85} />
            <SvgText x={x + barW / 2} y={chartH + 18} fontSize={8} fill="#888" textAnchor="middle">
              {b.month}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

function SectionCard({ title, children, icon, color }: { title: string; children: React.ReactNode; icon?: string; color?: string }) {
  return (
    <View style={crdStyles.card}>
      <View style={crdStyles.header}>
        {icon && <Ionicons name={icon as any} size={16} color={color ?? '#E040FB'} />}
        <Text style={crdStyles.title}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const crdStyles = StyleSheet.create({
  card: {
    backgroundColor: '#1A1A2E',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2A2A40',
    marginBottom: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  title: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

function DevicePie({ devices }: { devices: DeviceCount[] }) {
  if (!devices.length) return null;

  const total = devices.reduce((s, d) => s + d.count, 0) || 1;
  let startAngle = 0;
  const segments = devices.map((d) => {
    const angle = (d.count / total) * 360;
    const seg = { ...d, angle, startAngle };
    startAngle += angle;
    return seg;
  });

  const colors = ['#7C4DFF', '#00E676', '#FFC107', '#E040FB', '#FF5252'];

  return (
    <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
      <Svg width={80} height={80}>
        {segments.map((s, i) => {
          const r = 35;
          const cx = 40;
          const cy = 40;
          const a1 = (s.startAngle * Math.PI) / 180;
          const a2 = ((s.startAngle + s.angle) * Math.PI) / 180;
          const x1 = cx + r * Math.cos(a1);
          const y1 = cy + r * Math.sin(a1);
          const x2 = cx + r * Math.cos(a2);
          const y2 = cy + r * Math.sin(a2);
          const large = s.angle > 180 ? 1 : 0;
          const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
          return <Path key={i} d={path} fill={colors[i % colors.length]} opacity={0.9} />;
        })}
        <Rect x={28} y={28} width={24} height={24} rx={12} fill="#13131F" />
      </Svg>
      <View style={{ gap: 6 }}>
        {devices.map((d, i) => (
          <View key={d.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors[i % colors.length] }} />
            <Text style={{ color: '#aaa', fontSize: 12, flex: 1 }}>{d.name}</Text>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{d.pct}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

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

export default function ActivityScreen({ activity }: { activity: ActivityData }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        
        {/* Top Users */}
        {activity.topUsers.length > 0 && (
          <SectionCard title="Top Interacted Users" icon="trophy-outline" color="#FFC107">
            {activity.topUsers.map((u, i) => (
              <TopUserCard key={u.name} user={u} index={i} />
            ))}
          </SectionCard>
        )}
        {/* Sessions & Devices */}
        <SectionCard title="Sessions Overview" icon="phone-portrait-outline" color="#7C4DFF">
          <View style={styles.chipRow}>
            <StatChip label="Total Sessions" value={activity.totalSessions} color="#7C4DFF" />
            <StatChip label="Devices Used" value={activity.devicesUsed} color="#00E676" />
            <StatChip label="Peak Login Month" value={activity.mostActiveLoginMonth} color="#FFC107" />
          </View>
          {activity.deviceBreakdown.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <Text style={{ color: '#888', fontSize: 12, fontWeight: '600', marginBottom: 10 }}>Device Breakdown</Text>
              <DevicePie devices={activity.deviceBreakdown} />
            </View>
          )}
        </SectionCard>

        {/* Monthly Activity Chart */}
        {activity.monthlyBars.length > 0 && (
          <SectionCard title="Monthly Activity" icon="bar-chart-outline" color="#E91E63">
            <MonthlyChart bars={activity.monthlyBars} />
            <View style={[styles.chipRow, { marginTop: 10, justifyContent: 'center' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#E91E63' }} />
                <Text style={{ color: '#888', fontSize: 10 }}>Comments</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#FFC107' }} />
                <Text style={{ color: '#888', fontSize: 10 }}>Polls</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#7C4DFF' }} />
                <Text style={{ color: '#888', fontSize: 10 }}>QA</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#00E676' }} />
                <Text style={{ color: '#888', fontSize: 10 }}>Logins</Text>
              </View>
            </View>
          </SectionCard>
        )}

        

        {/* Login History */}
        {activity.loginHistory.length > 0 && (
          <SectionCard title="Recent Logins" icon="log-in-outline" color="#00E676">
            {activity.loginHistory.slice(0, 10).map((entry, i) => (
              <View key={i} style={styles.loginRow}>
                <Ionicons name="log-in" size={14} color="#00E676" />
                <Text style={styles.loginTime}>{entry.time}</Text>
                <Text style={styles.loginDevice}>{entry.device}</Text>
                <Text style={styles.loginIp}>{entry.ip}</Text>
              </View>
            ))}
          </SectionCard>
        )}

        {activity.topUsers.length === 0 &&
          activity.monthlyBars.length === 0 &&
          activity.loginHistory.length === 0 && (
            <Text style={styles.emptyText}>
              No activity data available. Import a complete Instagram ZIP to see insights.
            </Text>
          )}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 24 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  loginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A4044',
    gap: 10,
  },
  loginTime: { color: '#DDD', fontSize: 12, fontWeight: '500', flex: 1 },
  loginDevice: { color: '#888', fontSize: 11, fontWeight: '600', width: 60 },
  loginIp: { color: '#666', fontSize: 10, width: 80, textAlign: 'right' },
  emptyText: { color: '#666', fontSize: 14, textAlign: 'center', marginTop: 40 },
});
