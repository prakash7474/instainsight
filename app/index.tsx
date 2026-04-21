import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Image,
    Dimensions,
    ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

export default function HomeScreen() {
    const router = useRouter();
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const [hasData, setHasData] = React.useState(false);

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 800,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 800,
                useNativeDriver: true,
            }),
        ]).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.08,
                    duration: 1400,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1400,
                    useNativeDriver: true,
                }),
            ])
        ).start();

        checkExistingData();
    }, []);

    const checkExistingData = async () => {
        const stored = await AsyncStorage.getItem('instainsight_data');
        setHasData(!!stored);
    };

    return (
        <View style={styles.container}>
            {/* Background gradient */}
            <LinearGradient
                colors={['#0F0F1A', '#1A0A2E', '#0F0F1A']}
                style={StyleSheet.absoluteFillObject}
            />

            {/* Decorative blobs */}
            <View style={styles.blob1} />
            <View style={styles.blob2} />

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <Animated.View
                    style={[
                        styles.content,
                        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
                    ]}
                >
                    {/* Logo */}
                    <Animated.View style={[styles.logoWrap, { transform: [{ scale: pulseAnim }] }]}>
                        <LinearGradient
                            colors={['#E040FB', '#7C4DFF']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.logoGradient}
                        >
                            <Ionicons name="bar-chart" size={44} color="#fff" />
                        </LinearGradient>
                    </Animated.View>

                    <Text style={styles.appName}>InstaInsight</Text>
                    <Text style={styles.tagline}>Understand Your Instagram Relationships</Text>

                    {/* Feature cards */}
                    <View style={styles.featureRow}>
                        <FeatureCard icon="people" label="Followers" color="#E040FB" />
                        <FeatureCard icon="person-remove" label="Not Following" color="#FF5252" />
                        <FeatureCard icon="analytics" label="Insights" color="#00BCD4" />
                    </View>

                    {/* How it works */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>How It Works</Text>
                        {[
                            { n: '1', t: 'Export your Instagram data' },
                            { n: '2', t: 'Import the ZIP file here' },
                            { n: '3', t: 'Get instant insights' },
                        ].map((step) => (
                            <View key={step.n} style={styles.stepRow}>
                                <View style={styles.stepBadge}>
                                    <Text style={styles.stepNum}>{step.n}</Text>
                                </View>
                                <Text style={styles.stepText}>{step.t}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Privacy notice */}
                    <View style={styles.privacyCard}>
                        <Ionicons name="shield-checkmark" size={20} color="#00E676" />
                        <Text style={styles.privacyText}>
                            100% private — all processing happens on your device. No passwords required.
                        </Text>
                    </View>

                    {/* Resume / Step 4 Flow */}
                    <View style={styles.resumeContainer}>
                        <View style={styles.card}>
                            <Text style={styles.cardTitle}>Already requested data?</Text>
                            <Text style={styles.cardSubtext}>
                                If you've already started the export on Instagram, you can jump
                                straight to your download list.
                            </Text>
                            <TouchableOpacity
                                style={styles.inlineBtn}
                                onPress={() => router.push('/browser')}
                            >
                                <Ionicons name="arrow-forward-circle" size={20} color="#00BCD4" />
                                <Text style={styles.inlineBtnText}>Go to Download Page</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* CTAs */}
                    <TouchableOpacity
                        style={styles.primaryBtn}
                        onPress={() => router.push('/browser')}
                        activeOpacity={0.85}
                    >
                        <LinearGradient
                            colors={['#E040FB', '#7C4DFF']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.btnGradient}
                        >
                            <Ionicons name="logo-instagram" size={22} color="#fff" />
                            <Text style={styles.btnText}>Get Instagram Data</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.secondaryBtn}
                        onPress={() => router.push('/upload')}
                        activeOpacity={0.85}
                    >
                        <Ionicons name="cloud-upload-outline" size={22} color="#E040FB" />
                        <Text style={styles.secondaryBtnText}>Import ZIP File</Text>
                    </TouchableOpacity>

                    {hasData && (
                        <TouchableOpacity
                            style={styles.resumeBtn}
                            onPress={() => router.push('/dashboard')}
                            activeOpacity={0.85}
                        >
                            <Ionicons name="refresh-circle" size={20} color="#00BCD4" />
                            <Text style={styles.resumeText}>View Last Analysis</Text>
                        </TouchableOpacity>
                    )}
                </Animated.View>
            </ScrollView>
        </View>
    );
}

function FeatureCard({
    icon,
    label,
    color,
}: {
    icon: string;
    label: string;
    color: string;
}) {
    return (
        <View style={[styles.featureCard, { borderColor: color + '44' }]}>
            <Ionicons name={icon as any} size={26} color={color} />
            <Text style={[styles.featureLabel, { color }]}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F0F1A' },
    scroll: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 20 },
    content: { width: '100%', alignItems: 'center' },
    blob1: {
        position: 'absolute',
        top: -80,
        right: -80,
        width: 260,
        height: 260,
        borderRadius: 130,
        backgroundColor: '#E040FB22',
    },
    blob2: {
        position: 'absolute',
        bottom: 100,
        left: -60,
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: '#7C4DFF22',
    },
    logoWrap: { marginBottom: 20 },
    logoGradient: {
        width: 90,
        height: 90,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#E040FB',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 12,
    },
    appName: {
        fontSize: 36,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 0.5,
        marginBottom: 6,
    },
    tagline: {
        fontSize: 14,
        color: '#888',
        marginBottom: 32,
        textAlign: 'center',
    },
    featureRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 28,
    },
    featureCard: {
        flex: 1,
        backgroundColor: '#1A1A2E',
        borderRadius: 16,
        borderWidth: 1,
        padding: 14,
        alignItems: 'center',
        gap: 6,
    },
    featureLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
    card: {
        width: '100%',
        backgroundColor: '#1A1A2E',
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#2A2A40',
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 14,
    },
    stepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    stepBadge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#7C4DFF',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    stepNum: { color: '#fff', fontWeight: '700', fontSize: 13 },
    stepText: { color: '#CCC', fontSize: 14 },
    privacyCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#00E67611',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#00E67633',
        padding: 14,
        marginBottom: 28,
        gap: 10,
        width: '100%',
    },
    privacyText: { color: '#00E676', fontSize: 12, flex: 1, lineHeight: 18 },
    primaryBtn: {
        width: '100%',
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 14,
        shadowColor: '#E040FB',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 8,
    },
    btnGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 17,
        gap: 10,
    },
    btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    secondaryBtn: {
        width: '100%',
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: '#E040FB',
        paddingVertical: 15,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 14,
        backgroundColor: '#E040FB11',
    },
    secondaryBtnText: { color: '#E040FB', fontSize: 16, fontWeight: '700' },
    resumeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 12,
    },
    resumeText: { color: '#00BCD4', fontSize: 14, fontWeight: '600' },
    resumeContainer: { width: '100%', marginBottom: 16 },
    cardSubtext: { fontSize: 13, color: '#888', lineHeight: 20, marginBottom: 12 },
    inlineBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#00BCD422',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        alignSelf: 'flex-start',
    },
    inlineBtnText: { color: '#00BCD4', fontSize: 13, fontWeight: '700' },
});
