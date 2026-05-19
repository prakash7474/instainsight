import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type TopCombinedItem = {
  user: string;
  likedPosts: number;
  likedComments: number;
  total: number;
};

export type ActivityScreenProps = {
  engagement?: {
    // preferred shape (from adapter example / full analytics)
    topCombined?: TopCombinedItem[];
    totalLikes?: number;
    totalComments?: number;

    // fallback shape (what parts of the app may store)
    topLikes?: { user: string; count: number }[];
  };
  loginHistoryTimestamps?: number[]; // timestamps in ms
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Unknown';
}

export default function FileRoleActivityScreen({ engagement, loginHistoryTimestamps }: ActivityScreenProps) {
  const loginHistory = Array.isArray(loginHistoryTimestamps) ? loginHistoryTimestamps : [];

  const topCombined = engagement?.topCombined ?? [];
  const topLikes = engagement?.topLikes ?? [];

  const formattedLoginHistory = useMemo(
    () =>
      loginHistory
        .map((ts) => (typeof ts === 'number' ? formatTimestamp(ts) : 'Unknown'))
        .filter(Boolean),
    [loginHistory]
  );

  const totalLikes =
    typeof engagement?.totalLikes === 'number'
      ? engagement.totalLikes
      : topLikes.reduce((sum, u) => sum + (typeof u.count === 'number' ? u.count : 0), 0);

  const totalComments =
    typeof engagement?.totalComments === 'number'
      ? engagement.totalComments
      : topCombined.reduce((sum, u) => sum + (typeof u.likedComments === 'number' ? u.likedComments : 0), 0);

  const infoCards = [
    { label: 'Liked Posts', value: totalLikes, icon: 'heart', color: '#E91E63' },
    { label: 'Comments', value: totalComments, icon: 'chatbubble', color: '#2196F3' },
  ] as const;

  const maxCount = topCombined[0]?.total ?? 1;

  return (
    <ScrollView contentContainerStyle={activityStyles.scroll} showsVerticalScrollIndicator={false}>
      <Text style={activityStyles.sectionTitle}>Engagement Summary</Text>

      <View style={activityStyles.cardGrid}>
        {infoCards.map((c) => (
          <View key={c.label} style={activityStyles.summaryCard}>
            <Ionicons name={c.icon as any} size={16} color={c.color} />
            <Text style={[activityStyles.summaryValue, { color: c.color }]}>{c.value.toLocaleString()}</Text>
            <Text style={activityStyles.summaryLabel}>{c.label}</Text>
          </View>
        ))}
      </View>

      {topCombined.length > 0 && (
        <View style={activityStyles.card}>
          <Text style={activityStyles.cardTitle}>Top Interacted Users</Text>
          {topCombined.map((u, i) => (
            <View key={u.user} style={activityStyles.userRow}>
              <Text style={activityStyles.rank}>#{i + 1}</Text>
              <Text style={activityStyles.userName}>@{u.user}</Text>

              <View style={{ flexDirection: 'row', gap: 3 }}>
                {u.likedPosts > 0 && <Text style={activityStyles.tag}>♥{u.likedPosts}</Text>}
                {u.likedComments > 0 && <Text style={activityStyles.tag}>💬{u.likedComments}</Text>}
              </View>

              <View
                style={{
                  width: 70,
                  height: 14,
                  backgroundColor: '#2A2A40',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={[
                    activityStyles.timelineFill,
                    { width: `${(u.total / maxCount) * 100}%`, backgroundColor: '#E91E63' },
                  ]}
                />
              </View>

              <Text style={activityStyles.timelineCount}>{u.total}</Text>
            </View>
          ))}
        </View>
      )}

      {loginHistory.length > 0 && (
        <View style={activityStyles.card}>
          <Text style={activityStyles.cardTitle}>Login History ({loginHistory.length} logins)</Text>
          {formattedLoginHistory.slice(0, 50).map((out, i) => (
            <View key={i} style={activityStyles.loginRow}>
              <Ionicons name="log-in" size={14} color="#00E676" />
              <Text style={activityStyles.loginTime}>{out}</Text>
            </View>
          ))}
        </View>
      )}

      {topCombined.length === 0 && loginHistory.length === 0 && (
        <Text style={activityStyles.emptyText}>No activity or engagement data found in your Instagram export.</Text>
      )}
    </ScrollView>
  );
}

const activityStyles = StyleSheet.create({
  scroll: { paddingBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 14, marginTop: 4 },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  summaryCard: {
    width: '47%',
    backgroundColor: '#1A1A2E',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2A2A40',
    gap: 6,
    alignItems: 'center',
  },
  summaryValue: { fontSize: 18, fontWeight: '800' },
  summaryLabel: { fontSize: 10, color: '#888' },
  card: {
    backgroundColor: '#1A1A2E',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2A2A40',
    marginBottom: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 14 },
  timelineTrack: { flex: 1, height: 14, backgroundColor: '#2A2A40', borderRadius: 4, overflow: 'hidden' },
  timelineFill: { height: '100%', borderRadius: 4 },
  timelineCount: { width: 32, textAlign: 'right', fontSize: 11, color: '#888' },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A4044',
    gap: 10,
  },
  rank: { width: 26, color: '#E040FB', fontWeight: '800', fontSize: 12 },
  userName: { flex: 1, color: '#DDD', fontSize: 13, fontWeight: '500' },
  loginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A4044',
    gap: 10,
  },
  loginTime: { color: '#DDD', fontSize: 12, fontWeight: '500' },
  emptyText: { color: '#666', fontSize: 14, textAlign: 'center', marginTop: 40 },
  tag: { color: '#888', fontSize: 10, backgroundColor: '#222', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
});
