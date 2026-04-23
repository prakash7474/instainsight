import React, { useEffect, useState, useRef } from 'react';
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
    const total = data.reduce((s, d) => s + d.value, 0);

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
            const midAngle = startAngle + angle / 2;
            startAngle = endAngle;
            return { ...d, path, midAngle };
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

export default function DashboardScreen() {
    const router = useRouter();
    const [data, setData] = useState<InstagramData | null>(null);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'followers' | 'engagement' | 'activity'>('followers');
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const stored = await AsyncStorage.getItem('instainsight_data');
        if (stored) {
            const parsed: InstagramData = JSON.parse(stored);
            setData(parsed);
            setStats(computeStats(parsed));
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
        router.replace('/');
    };

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

    const processedDate = new Date(data.processedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#0F0F1A', '#1A0A2E', '#0F0F1A']}
                style={StyleSheet.absoluteFillObject}
            />
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
                {/* Header */}
                <View style={styles.header}>
                    <View>
                        <Text style={styles.headerTitle}>
                            {activeTab === 'followers' ? 'Followers'
                                : activeTab === 'engagement' ? 'Engagement'
                                    : 'Activity'}
                        </Text>
                        <Text style={styles.headerSub}>Updated {processedDate}</Text>
                    </View>
                    <TouchableOpacity onPress={clearData} style={styles.clearBtn}>
                        <Ionicons name="trash-outline" size={18} color="#FF5252" />
                    </TouchableOpacity>
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
                                        <Text style={styles.legendLabel}>{d.label} ({d.value})</Text>
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
                                        <Text style={styles.actionLabel}>
                                            {new Date(ts).toLocaleString()}
                                        </Text>
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
        borderRadius: 10,
        padding: 10,
        borderWidth: 1,
        borderColor: '#FF525233',
    },
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
    statValue: { fontSize: 22, fontWeight: '800' },
    statLabel: { fontSize: 11, color: '#888', textAlign: 'center' },
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
    fadeContainer: { width: '100%', marginBottom: 10 },
    cardSub: { color: '#888', fontSize: 12, marginTop: -12, marginBottom: 16 },
    emptyNote: { color: '#666', fontSize: 13, textAlign: 'center', marginVertical: 20 },
    rankText: { color: '#E040FB', fontWeight: '800', width: 28 },
    countTag: { color: '#666', fontSize: 11, backgroundColor: '#222', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
});
