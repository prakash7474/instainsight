import { View, Text, StyleSheet } from 'react-native';
import type { AccountAge } from '@/utils/dnaParser';

type Props = {
  age: AccountAge;
};

export function AccountAgeCard({ age }: Props) {
  const pct = Math.min((age.ageInYears / 10) * 100, 100);

  return (
    <View style={s.card}>
      <View style={s.topRow}>
        <View>
          <Text style={s.label}>Account age</Text>
          <Text style={s.age}>{age.ageString}</Text>
          <Text style={s.since}>Since {age.signupLabel}</Text>
        </View>
        <Text style={s.era}>{age.era}</Text>
      </View>

      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${pct}%` }]} />
      </View>

      <View style={s.statsRow}>
        {[
          { label: 'Days', value: age.ageInDays.toLocaleString() },
          { label: 'Months', value: age.ageInMonths },
          { label: 'Years', value: age.ageInYears },
        ].map(stat => (
          <View key={stat.label} style={s.stat}>
            <Text style={s.statVal}>{stat.value}</Text>
            <Text style={s.statLbl}>{stat.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#1A1A2E', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#2A2A40', marginBottom: 16 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  age: { fontSize: 28, fontWeight: '700', color: '#f0effe' },
  since: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  era: { fontSize: 20, marginTop: 4 },
  barTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', marginBottom: 14 },
  barFill: { height: '100%', backgroundColor: '#b8a9ff', borderRadius: 2 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '700', color: '#b8a9ff' },
  statLbl: { fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
});
