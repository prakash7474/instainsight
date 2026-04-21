import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Platform,
    Linking,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const TARGET_URL = 'https://accountscenter.instagram.com/info_and_permissions/dyi/';

export default function BrowserScreen() {
    const router = useRouter();
    const [url] = useState(TARGET_URL);
    const [currentUrl] = useState(TARGET_URL);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const status = { text: '📥 Request your Instagram data (login handled automatically)' };

    return (
        <View style={styles.container}>
            {/* Fixed guidance banner */}
            <View style={styles.banner}>
                <Text style={styles.bannerText}>{status.text}</Text>
            </View>

            {/* Progress Bar (Mobile Only) */}
            {Platform.OS !== 'web' && progress < 1 && progress > 0 && (
                <View style={styles.progressBarContainer}>
                    <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
                </View>
            )}

            {/* WebView with Web Fallback */}
            {Platform.OS === 'web' ? (
                <View style={styles.webFallback}>
                    <Ionicons name="globe-outline" size={64} color="#E040FB33" />
                    <Text style={styles.webFallbackTitle}>Open in Browser</Text>
                    <Text style={styles.webFallbackText}>
                        Open Instagram data download page directly:
                    </Text>
                    <TouchableOpacity
                        style={styles.openWebBtn}
                        onPress={() => Linking.openURL(TARGET_URL)}
                    >
                        <Ionicons name="logo-instagram" size={20} color="#fff" />
                        <Text style={styles.openWebBtnText}>Get Instagram Data</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <WebView
                    source={{ uri: url }}
                    style={styles.webview}
                    onLoadStart={() => {
                        setLoading(true);
                        setProgress(0.1);
                    }}
                    onLoadProgress={({ nativeEvent }) => {
                        setProgress(nativeEvent.progress);
                    }}
                    onLoadEnd={() => {
                        setLoading(false);
                        setProgress(1);
                    }}
                    onNavigationStateChange={() => {}}
                    javaScriptEnabled
                    domStorageEnabled
                    sharedCookiesEnabled
                    allowsBackForwardNavigationGestures
                />
            )}

            {loading && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#E040FB" />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F0F1A' },
    banner: {
        backgroundColor: '#1A1A2E',
        borderBottomWidth: 1,
        borderBottomColor: '#E040FB44',
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    bannerText: { color: '#E040FB', fontSize: 14, fontWeight: '700' },
    bannerSubtext: { color: '#888', fontSize: 11, marginTop: 2 },
    bannerMain: { flex: 1 },
    navBar: {
        flexDirection: 'row',
        backgroundColor: '#13131F',
        borderBottomWidth: 1,
        borderBottomColor: '#2A2A40',
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 8,
    },
    navBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 10,
        backgroundColor: '#1E1E30',
    },
    navBtnPrimary: { backgroundColor: '#7C4DFF' },
    navBtnText: { color: '#aaa', fontSize: 12, fontWeight: '600' },
    webview: { flex: 1 },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#0F0F1A66',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    progressBarContainer: {
        height: 3,
        width: '100%',
        backgroundColor: '#1A1A2E',
        zIndex: 20,
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#E040FB',
    },
    webFallback: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        gap: 16,
    },
    webFallbackTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#fff',
        textAlign: 'center',
    },
    webFallbackText: {
        fontSize: 14,
        color: '#888',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 8,
    },
    openWebBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: '#E040FB',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 14,
    },
    openWebBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
});
