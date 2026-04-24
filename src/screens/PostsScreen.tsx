import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMediaStore } from '../store/useMediaStore';
import { MediaGrid } from '../components/MediaGrid';
import { ViewerModal } from '../components/ViewerModal';

export const PostsScreen = () => {
    const { posts, archivedPosts, isScanning, scanProgress } = useMediaStore();
    const [activeTab, setActiveTab] = useState<'posted' | 'archived'>('posted');

    const [viewerVisible, setViewerVisible] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const currentData = activeTab === 'posted' ? posts : archivedPosts;

    const handleMediaPress = (index: number) => {
        setSelectedIndex(index);
        setViewerVisible(true);
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Posts Gallery</Text>
            </View>

            <View style={styles.tabContainer}>
                <Pressable
                    style={[styles.tab, activeTab === 'posted' && styles.activeTab]}
                    onPress={() => setActiveTab('posted')}
                >
                    <Text style={[styles.tabText, activeTab === 'posted' && styles.activeTabText]}>
                        Posted ({posts.length})
                    </Text>
                </Pressable>
                <Pressable
                    style={[styles.tab, activeTab === 'archived' && styles.activeTab]}
                    onPress={() => setActiveTab('archived')}
                >
                    <Text style={[styles.tabText, activeTab === 'archived' && styles.activeTabText]}>
                        Archived ({archivedPosts.length})
                    </Text>
                </Pressable>
            </View>

            {isScanning && currentData.length === 0 ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#00ffcc" />
                    <Text style={styles.progressText}>{scanProgress.message}</Text>
                    {scanProgress.submessage && <Text style={styles.subtext}>{scanProgress.submessage}</Text>}
                </View>
            ) : currentData.length === 0 ? (
                <View style={styles.center}>
                    <Text style={styles.emptyText}>No {activeTab} posts found.</Text>
                </View>
            ) : (
                <MediaGrid data={currentData} onMediaPress={handleMediaPress} />
            )}

            {viewerVisible && currentData.length > 0 && (
                <ViewerModal
                    visible={viewerVisible}
                    media={currentData}
                    initialIndex={selectedIndex}
                    onClose={() => setViewerVisible(false)}
                />
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    header: {
        padding: 16,
        paddingBottom: 8,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
    },
    tabContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        marginBottom: 12,
    },
    tab: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        marginRight: 8,
        borderWidth: 1,
        borderColor: '#333',
    },
    activeTab: {
        backgroundColor: '#fff',
        borderColor: '#fff',
    },
    tabText: {
        color: '#888',
        fontSize: 14,
        fontWeight: '600',
    },
    activeTabText: {
        color: '#000',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    progressText: {
        color: '#fff',
        marginTop: 16,
        fontSize: 16,
    },
    subtext: {
        color: '#888',
        marginTop: 8,
        fontSize: 14,
    },
    emptyText: {
        color: '#555',
        fontSize: 16,
    }
});
