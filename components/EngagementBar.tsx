import { View, Text, StyleSheet } from 'react-native';

type Props = {
  user: string;
  count: number;
  maxCount: number;
  color: string;
};

export function EngagementBar({ user, count, maxCount, color }: Props) {
  const pct = maxCount > 0 ? count / maxCount : 0;

  return (
    <View style={styles.row}>
      <Text style={styles.name} numberOfLines={1}>
        @{user}
      </Text>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${pct * 100}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={styles.count}>{count.toLocaleString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  name: { width: 130, fontSize: 12, color: '#DDD', marginRight: 8, fontWeight: '500' },
  track: { flex: 1, height: 18, backgroundColor: '#2A2A40', borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  count: { width: 40, textAlign: 'right', fontSize: 12, color: '#888', marginLeft: 8 },
});
