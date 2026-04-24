import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useMediaStore, MediaFolder } from '../store/useMediaStore';
import { StoryRow } from '../components/StoryRow';
import { ViewerModal } from '../components/ViewerModal';

export const StoriesScreen = () => {
    const { storyMonths, storiesMap, isScanning, scanProgress } = useMediaStore();

    const [viewerState, setViewerState] = useState<{
        visible: boolean;
        month: string;
        index: number;
    }>({
        visible: false,
        month: '',
        index: 0,
    });

    const handleStoryPress = useCallback((month: string, index: number) => {
        setViewerState({
            visible: true,
            month,
            index,
        });
    }, []);

    const closeViewer = useCallback(() => {
        setViewerState((prev) => ({ ...prev, visible: false }));
    }, []);

    const renderMonth = useCallback(({ item }: { item: MediaFolder }) => {
        return <StoryRow folder={item} onStoryPress={handleStoryPress} />;
    }, [handleStoryPress]);

    // Which media to pass to the viewer
    const viewerMedia = viewerState.visible && viewerState.month
        ? (storiesMap[viewerState.month] || [])
        : [];

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Stories Timeline</Text>
            </View>

            {isScanning && storyMonths.length === 0 ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#00ffcc" />
                    <Text style={styles.progressText}>{scanProgress.message}</Text>
                </View>
            ) : storyMonths.length === 0 ? (
                <View style={styles.center}>
                    <Text style={styles.emptyText}>No stories found.</Text>
                </View>
            ) : (
                <FlashList
                    data={storyMonths}
                    renderItem={renderMonth}
                    estimatedItemSize={250} // Height of header + scroll view
                    showsVerticalScrollIndicator={false}
                    keyExtractor={(item) => item.month}
                />
            )}

            {viewerState.visible && viewerMedia.length > 0 && (
                <ViewerModal
                    visible={viewerState.visible}
                    media={viewerMedia}
                    initialIndex={viewerState.index}
                    onClose={closeViewer}
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
        paddingBottom: 16,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
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
    emptyText: {
        color: '#555',
        fontSize: 16,
    }
});
