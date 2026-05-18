import { useMemo } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useInstagramAnalyticsData } from '../hooks/useInstagramAnalyticsData';
import { EngagementBar } from '../components/EngagementBar';

export default function EngagementScreen() {
  const { data } = useInstagramAnalyticsData();

  const topLikes = data?.engagement?.topLikes ?? [];
  const totalLikes = data?.engagement?.totalLikes ?? 0;
  const totalComments = data?.engagement?.totalComments ?? 0;

  const maxCount = useMemo(() => Math.max(...topLikes.map(u => u.count), 1), [topLikes]);

  if (!data) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#0F0F1A', '#1A0A2E', '#0F0F1A']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.emptyState}>
          <Ionicons name="heart-dislike" size={48} color="#444" />
          <Text style={styles.emptyTitle}>No Engagement Data</Text>
          <Text style={styles.emptySub}>Import your Instagram ZIP to see engagement insights</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0F0F1A', '#1A0A2E', '#0F0F1A']}
        style={StyleSheet.absoluteFillObject}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Engagement</Text>
          <Text style={styles.headerSub}>Liked posts & comments breakdown</Text>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.card}>
            <Ionicons name="heart" size={18} color="#E040FB" />
            <Text style={styles.cardLabel}>Liked Posts</Text>
            <Text style={styles.cardValue}>
              {totalLikes.toLocaleString()}
            </Text>
          </View>
          <View style={styles.card}>
            <Ionicons name="chatbubble" size={18} color="#00E676" />
            <Text style={styles.cardLabel}>Comments</Text>
            <Text style={styles.cardValue}>
              {totalComments.toLocaleString()}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Liked Posts Users</Text>
          {topLikes.length > 0 ? (
            <View style={styles.barList}>
              {topLikes.map((item) => (
                <EngagementBar
                  key={item.user}
                  user={item.user}
                  count={item.count}
                  maxCount={maxCount}
                  color="#7C4DFF"
                />
              ))}
            </View>
          ) : (
            <Text style={styles.emptyNote}>No liked post data found in your export.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F1A' },
  content: { padding: 20, paddingTop: 28, paddingBottom: 40 },
  header: { marginBottom: 24 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 12, color: '#666', marginTop: 4 },
  metricsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  card: {
    flex: 1,
    backgroundColor: '#1A1A2E',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A40',
    gap: 8,
  },
  cardLabel: { fontSize: 12, color: '#888' },
  cardValue: { fontSize: 24, fontWeight: '500', color: '#fff' },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 14 },
  barList: { gap: 4 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#fff', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#666', marginTop: 8, textAlign: 'center' },
  emptyNote: { color: '#666', fontSize: 13, textAlign: 'center', marginVertical: 20 },
});
