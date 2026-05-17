import { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useInstagramData } from '../hooks/useInstagramData';
import { EngagementBar } from '../components/EngagementBar';

type Tab = 'posts' | 'comments' | 'combined';

export default function EngagementScreen() {
  const data = useInstagramData();
  const [tab, setTab] = useState<Tab>('posts');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'posts', label: 'Liked Posts' },
    { key: 'comments', label: 'Liked Comments' },
    { key: 'combined', label: 'Combined' },
  ];

  const currentList =
    tab === 'posts'
      ? data.topLikedPostUsers
      : tab === 'comments'
        ? data.topLikedCmtUsers
        : data.topCombined.map((u) => ({ user: u.user, count: u.total }));

  const maxCount = currentList[0]?.count ?? 1;
  const barColor = tab === 'posts' ? '#7C4DFF' : tab === 'comments' ? '#00E676' : '#E040FB';

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
              {data.summary.totalLikedPosts.toLocaleString()}
            </Text>
          </View>
          <View style={styles.card}>
            <Ionicons name="chatbubble" size={18} color="#00E676" />
            <Text style={styles.cardLabel}>Liked Comments</Text>
            <Text style={styles.cardValue}>
              {data.summary.totalLikedComments.toLocaleString()}
            </Text>
          </View>
        </View>

        <View style={styles.tabs}>
          {tabs.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, tab === t.key && styles.tabActive]}
              onPress={() => setTab(t.key)}
            >
              <Text
                style={[styles.tabText, tab === t.key && styles.tabTextActive]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.barList}>
          {currentList.map((item) => (
            <EngagementBar
              key={item.user}
              user={item.user}
              count={item.count}
              maxCount={maxCount}
              color={barColor}
            />
          ))}
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
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: '#2A2A40',
  },
  tabActive: {
    backgroundColor: '#1A1A2E',
    borderColor: '#E040FB',
  },
  tabText: { fontSize: 13, color: '#666' },
  tabTextActive: { color: '#E040FB', fontWeight: '500' },
  barList: { gap: 4 },
});
