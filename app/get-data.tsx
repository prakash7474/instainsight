import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Platform,
    Linking,
    SafeAreaView,
    Dimensions,
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

const { width } = Dimensions.get('window');

// URLs and Patterns
const START_URL = 'https://www.instagram.com/';
const ACCOUNTS_CENTER_URL = 'https://accountscenter.instagram.com/info_and_permissions/';
const INSTAGRAM_HOME = 'https://www.instagram.com/';

type Step = 'Login' | 'Redirect' | 'Info' | 'Export' | 'Wait' | 'Download' | 'Upload';

interface GuideState {
    message: string;
    icon: string;
    step: Step;
    progress: number;
}

export default function BrowserScreen() {
    const webViewRef = useRef<WebView>(null);
    const router = useRouter();
    const params = useLocalSearchParams();
    const initialUrl = (params.startUrl as string) || START_URL;

    const [currentUrl, setCurrentUrl] = useState(initialUrl);
    const [loading, setLoading] = useState(false);
    const hasRedirectedRef = useRef(false);
    const [guide, setGuide] = useState<GuideState>({
        message: '🚀 Starting...',
        icon: 'play-outline',
        step: 'Login',
        progress: 0,
    });

    const updateGuide = (url: string, pageText: string = '', cookies: string = '') => {
        const text = pageText.toLowerCase();
        const lowUrl = url.toLowerCase();
        let newState: GuideState = { ...guide };

        const isLoggedIn = cookies.includes('sessionid') ||
            lowUrl.includes('/accounts/onetap/') ||
            (lowUrl.includes('/accounts/') && !lowUrl.includes('login') && !lowUrl.includes('accountscenter')) ||
            (lowUrl === INSTAGRAM_HOME && !text.includes('login'));

        // 1. LOGIN REQUIRED
        if (lowUrl.includes('login') || (lowUrl === INSTAGRAM_HOME && !isLoggedIn)) {
            newState = {
                message: '🔐 Please login to your Instagram account',
                icon: 'lock-closed-outline',
                step: 'Login',
                progress: 0.1,
            };
            hasRedirectedRef.current = false; // Allow redirect again if they logs out and in
        }
        // 2. LOGIN SUCCESS DETECTION (REDIRECT PHASE)
        else if (isLoggedIn && !lowUrl.includes('accountscenter')) {
            newState = {
                message: '✅ Login successful → Redirecting...',
                icon: 'checkmark-circle-outline',
                step: 'Redirect',
                progress: 0.3,
            };

            // AUTO REDIRECT (ONLY ONCE)
            if (!hasRedirectedRef.current) {
                hasRedirectedRef.current = true;
                setTimeout(() => {
                    webViewRef.current?.injectJavaScript(`window.location.href = "${ACCOUNTS_CENTER_URL}";`);
                }, 1000);
            }
        }
        // 3. INFO PAGE
        else if (lowUrl.includes('accountscenter.instagram.com/info_and_permissions/') && !lowUrl.includes('dyi')) {
            newState = {
                message: "📂 Tap 'Download your information'",
                icon: 'folder-open-outline',
                step: 'Info',
                progress: 0.5,
            };
        }
        // 4. EXPORT FLOW (DYI and Confirmation)
        else if (lowUrl.includes('dyi') || text.includes('request submitted') || text.includes('pending')) {
            if (text.includes('request submitted') || text.includes('pending') || text.includes('in progress')) {
                newState = {
                    message: "⏳ Request submitted. Please wait...",
                    icon: 'hourglass-outline',
                    step: 'Wait',
                    progress: 0.85,
                };
            } else if (text.includes('download') && !text.includes('create')) {
                newState = {
                    message: "📥 Tap Download and save ZIP file",
                    icon: 'download-outline',
                    step: 'Download',
                    progress: 0.95,
                };
            } else if (text.includes('password')) {
                newState = {
                    message: "🔐 Enter password to confirm",
                    icon: 'key-outline',
                    step: 'Export',
                    progress: 0.8,
                };
            } else {
                newState = {
                    message: "📤 Tap 'Create Export'",
                    icon: 'paper-plane-outline',
                    step: 'Export',
                    progress: 0.7,
                };
            }
        }
        // FALLBACK
        else if (!lowUrl.includes('accountscenter')) {
            newState = {
                message: "🔐 Login required to continue",
                icon: 'log-in-outline',
                step: 'Login',
                progress: 0.15,
            };
        }

        setGuide(newState);
    };

    const injectedJS = `
        (function() {
            function checkPage() {
                const text = document.body.innerText;
                const cookies = document.cookie;
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'PAGE_STATE',
                    text: text,
                    url: window.location.href,
                    cookies: cookies
                }));
            }
            checkPage();
            // Listen for DOM changes or just poll
            setInterval(checkPage, 2000);
        })();
    `;

    const handleMessage = (event: any) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'PAGE_STATE') {
                updateGuide(data.url, data.text, data.cookies || '');
            }
        } catch (e) { }
    };

    const onNavigationStateChange = (navState: WebViewNavigation) => {
        setCurrentUrl(navState.url);
    };

    const handleOpenExternal = async () => {
        if (Platform.OS === 'web') {
            Linking.openURL(currentUrl);
        } else {
            await WebBrowser.openBrowserAsync(currentUrl);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Premium Smart Guide Overlay */}
            <View style={styles.guideWrapper}>
                <LinearGradient
                    colors={['#1A1A2E', '#13131F']}
                    style={styles.guideContainer}
                >
                    <View style={styles.guideHeader}>
                        <View style={styles.guideIconWrap}>
                            <Ionicons name={guide.icon as any} size={22} color="#E040FB" />
                        </View>
                        <View style={styles.guideTextWrap}>
                            <Text style={styles.guideMessage}>{guide.message}</Text>
                            <Text style={styles.guideStepsOverview}>🔐 Login → ✅ Redirect → 📂 Info → 📤 Export → ⏳ Wait → 📥 Download</Text>
                        </View>
                        <TouchableOpacity style={styles.infoBtn} onPress={handleOpenExternal}>
                            <Ionicons name="open-outline" size={18} color="#888" />
                        </TouchableOpacity>
                    </View>

                    {/* Progress Indicator */}
                    <View style={styles.progressContainer}>
                        <View style={styles.stepsRow}>
                            <StepBadge label="Login" active={guide.step === 'Login'} done={!['Login'].includes(guide.step)} />
                            <StepLine active={!['Login'].includes(guide.step)} />

                            <StepBadge label="Redirect" active={guide.step === 'Redirect'} done={!['Login', 'Redirect'].includes(guide.step)} />
                            <StepLine active={!['Login', 'Redirect'].includes(guide.step)} />

                            <StepBadge label="Info" active={guide.step === 'Info'} done={!['Login', 'Redirect', 'Info'].includes(guide.step)} />
                            <StepLine active={!['Login', 'Redirect', 'Info'].includes(guide.step)} />

                            <StepBadge label="Export" active={guide.step === 'Export'} done={!['Login', 'Redirect', 'Info', 'Export'].includes(guide.step)} />
                            <StepLine active={!['Login', 'Redirect', 'Info', 'Export'].includes(guide.step)} />

                            <StepBadge label="Wait" active={guide.step === 'Wait'} done={!['Login', 'Redirect', 'Info', 'Export', 'Wait'].includes(guide.step)} />
                            <StepLine active={!['Login', 'Redirect', 'Info', 'Export', 'Wait'].includes(guide.step)} />

                            <StepBadge label="Download" active={guide.step === 'Download'} done={guide.step === 'Upload'} />
                        </View>
                    </View>
                </LinearGradient>
                {/* Visual Accent */}
                <LinearGradient
                    colors={['#E040FB', '#7C4DFF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.accentLine, { width: `${guide.progress * 100}%` }]}
                />
            </View>

            {/* Export Configuration Help */}
            {guide.step === 'Export' && (
                <View style={styles.exportHelp}>
                    <Text style={styles.exportHelpTitle}>💡 Recommended Settings:</Text>
                    <Text style={styles.exportHelpText}>• Select "Export to device"</Text>
                    <Text style={styles.exportHelpText}>• Enter email if asked</Text>
                    <Text style={styles.exportHelpText}>• Date Range: Last 3 or 6 months</Text>
                    <Text style={styles.exportHelpText}>• Select: Followers & Following, Likes</Text>
                    <Text style={styles.exportHelpText}>• Format: JSON</Text>
                </View>
            )}

            {/* Quick Actions / Help Overlay */}
            {guide.step === 'Download' && (
                <TouchableOpacity
                    style={styles.floatingAction}
                    onPress={() => router.push('/upload')}
                >
                    <LinearGradient
                        colors={['#7C4DFF', '#E040FB']}
                        style={styles.actionGradient}
                    >
                        <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
                        <Text style={styles.actionText}>Go to Import Screen</Text>
                    </LinearGradient>
                </TouchableOpacity>
            )}

            {/* WebView */}
            {Platform.OS === 'web' ? (
                <View style={styles.webFallback}>
                    <Text style={styles.fallbackText}>Please use a mobile device for the guided experience.</Text>
                    <TouchableOpacity style={styles.openBtn} onPress={handleOpenExternal}>
                        <Text style={styles.openBtnText}>Open Instagram</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={{ flex: 1, paddingTop: 130 }}>
                    <WebView
                        ref={webViewRef}
                        source={{ uri: initialUrl }}
                        style={styles.webview}
                        onNavigationStateChange={onNavigationStateChange}
                        onLoadStart={() => setLoading(true)}
                        onLoadEnd={() => setLoading(false)}
                        injectedJavaScript={injectedJS}
                        onMessage={handleMessage}
                        javaScriptEnabled
                        domStorageEnabled
                        sharedCookiesEnabled
                        allowsBackForwardNavigationGestures
                        userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
                    />
                </View>
            )}

            {loading && (
                <View style={styles.loading}>
                    <ActivityIndicator size="small" color="#E040FB" />
                </View>
            )}
        </SafeAreaView>
    );
}

function StepBadge({ label, active, done }: { label: string; active: boolean; done: boolean }) {
    return (
        <View style={styles.stepBadge}>
            <View style={[
                styles.stepCircle,
                active ? styles.circleActive : (done ? styles.circleDone : styles.circleInactive)
            ]}>
                {done ? (
                    <Ionicons name="checkmark" size={10} color="#fff" />
                ) : (
                    <View style={active ? styles.dotActive : null} />
                )}
            </View>
            <Text style={[styles.stepLabel, active ? styles.labelActive : styles.labelInactive]}>{label}</Text>
        </View>
    );
}

function StepLine({ active }: { active: boolean }) {
    return <View style={[styles.stepLine, active ? styles.stepLineActive : styles.stepLineInactive]} />;
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F0F1A' },
    guideWrapper: {
        zIndex: 100,
        paddingHorizontal: 12,
        paddingTop: 10,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
    },
    guideContainer: {
        paddingTop: 12,
        paddingBottom: 18,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#E040FB44',
        boxShadow: '0px 10px 15px rgba(0,0,0,0.5)',
        elevation: 12,
    },
    guideHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    guideIconWrap: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: '#E040FB15',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        borderWidth: 1,
        borderColor: '#E040FB33',
    },
    guideTextWrap: { flex: 1 },
    guideMessage: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    guideStepsOverview: {
        color: '#888',
        fontSize: 9,
        fontWeight: '600',
        marginTop: 2,
        letterSpacing: -0.2,
    },
    infoBtn: { padding: 4 },
    progressContainer: {
        paddingHorizontal: 4,
    },
    stepsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    stepBadge: { alignItems: 'center', gap: 4 },
    stepCircle: {
        width: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    circleActive: { borderColor: '#E040FB', backgroundColor: '#E040FB33' },
    circleDone: { borderColor: '#00E676', backgroundColor: '#00E676' },
    circleInactive: { borderColor: '#444', backgroundColor: 'transparent' },
    dotActive: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E040FB' },
    stepLabel: { fontSize: 9, fontWeight: '700' },
    labelActive: { color: '#E040FB' },
    labelInactive: { color: '#555' },
    stepLine: { flex: 1, height: 1.5, marginBottom: 12, marginHorizontal: 2 },
    stepLineActive: { backgroundColor: '#E040FB88' },
    stepLineInactive: { backgroundColor: '#333' },
    accentLine: { height: 2, position: 'absolute', bottom: 0 },
    webview: { flex: 1, backgroundColor: '#000' },
    loading: {
        position: 'absolute',
        bottom: 20,
        right: 20,
        backgroundColor: '#1A1A2E',
        padding: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#2A2A40',
    },
    webFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
    fallbackText: { color: '#888', textAlign: 'center', marginBottom: 20 },
    openBtn: { backgroundColor: '#E040FB', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
    openBtnText: { color: '#fff', fontWeight: '700' },
    floatingAction: {
        position: 'absolute',
        bottom: 30,
        left: 20,
        right: 20,
        zIndex: 1000,
        boxShadow: '0px 4px 10px rgba(224,64,251,0.4)',
        elevation: 8,
    },
    actionGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 15,
        borderRadius: 15,
        gap: 10,
    },
    actionText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    exportHelp: {
        position: 'absolute',
        bottom: 100,
        right: 20,
        left: 20,
        backgroundColor: '#1A1A2E',
        padding: 15,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: '#E040FB44',
        zIndex: 50,
    },
    exportHelpTitle: {
        color: '#E040FB',
        fontWeight: '700',
        fontSize: 14,
        marginBottom: 8,
    },
    exportHelpText: {
        color: '#CCC',
        fontSize: 12,
        marginBottom: 4,
    },
});
