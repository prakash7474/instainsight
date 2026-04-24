import React, { useEffect, memo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useMediaStore, MediaItem, MediaFolder } from '../store/useMediaStore';
import { loadStoriesForMonth } from '../utils/mediaParser';

interface StoryRowProps {
    folder: MediaFolder;
    onStoryPress: (month: string, index: number) => void;
}

const STORY_WIDTH = 100;
const STORY_HEIGHT = 180;

const StoryItem = memo(({ item, index, month, onPress }: { item: MediaItem; index: number; month: string; onPress: (m: string, i: number) => void }) => (
    <Pressable style={styles.storyContainer} onPress={() => onPress(month, index)}>
        <Image
            source={{ uri: item.uri }}
            style={styles.storyImage}
            contentFit="cover"
            cachePolicy="disk"
            transition={200}
        />
        {item.type === 'video' && (
            <View style={styles.videoIcon}>
                <Ionicons name="play" size={16} color="#fff" />
            </View>
        )}
    </Pressable>
), (prev, next) => prev.item.id === next.item.id);

export const StoryRow = memo(({ folder, onStoryPress }: StoryRowProps) => {
    const { basePath, storiesMap } = useMediaStore();
    const formatMonth = (m: string) => {
        // Expected YYYYMM
        if (m.length === 6) {
            const year = m.substring(0, 4);
            const mStr = m.substring(4, 6);
            const date = new Date(parseInt(year), parseInt(mStr) - 1);
            return `${date.toLocaleString('default', { month: 'short' })} ${year}`;
        }
        return m;
    };

    const stories = storiesMap[folder.month] || [];

    useEffect(() => {
        if (basePath && stories.length === 0) {
            // Lazy load the stories for this month
            loadStoriesForMonth(basePath, folder.month);
        }
    }, [basePath, folder.month]);

    const renderItem = useCallback(({ item, index }: { item: MediaItem, index: number }) => (
        <StoryItem item={item} index={index} month={folder.month} onPress={onStoryPress} />
    ), [folder.month, onStoryPress]);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerText}>{formatMonth(folder.month)}</Text>
                <Text style={styles.countText}>{stories.length > 0 ? `${stories.length} stories` : 'Loading...'}</Text>
            </View>

            <View style={styles.listContainer}>
                {stories.length > 0 ? (
                    <FlashList
                        data={stories}
                        renderItem={renderItem}
                        estimatedItemSize={STORY_WIDTH}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        keyExtractor={item => item.id}
                    />
                ) : (
                    <View style={styles.loadingPlaceholder} />
                )}
            </View>
        </View>
    );
}, (prev, next) => prev.folder.month === next.folder.month && prev.folder.count === next.folder.count);

const styles = StyleSheet.create({
    container: {
        marginBottom: 24,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        paddingHorizontal: 16,
        marginBottom: 12,
    },
    headerText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    countText: {
        color: '#888',
        fontSize: 14,
    },
    listContainer: {
        height: STORY_HEIGHT,
    },
    storyContainer: {
        width: STORY_WIDTH,
        height: STORY_HEIGHT,
        marginHorizontal: 8,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: '#111',
    },
    storyImage: {
        width: '100%',
        height: '100%',
    },
    videoIcon: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 12,
        padding: 4,
    },
    loadingPlaceholder: {
        width: STORY_WIDTH,
        height: STORY_HEIGHT,
        marginHorizontal: 8,
        borderRadius: 8,
        backgroundColor: '#222',
    }
});
