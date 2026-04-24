import React, { memo, useCallback } from 'react';
import { View, StyleSheet, Dimensions, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { MediaItem } from '../store/useMediaStore';

interface MediaGridProps {
    data: MediaItem[];
    onMediaPress: (index: number) => void;
}

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 2;
const GAP = 2;
const ITEM_SIZE = (width - GAP * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

// Memoize individual items to prevent re-rendering when list scrolls
const GridItem = memo(({ item, index, onPress }: { item: MediaItem; index: number; onPress: (idx: number) => void }) => {
    return (
        <Pressable style={styles.itemContainer} onPress={() => onPress(index)}>
            <Image
                source={{ uri: item.uri }}
                style={styles.image}
                contentFit="cover"
                cachePolicy="disk"
                transition={200}
            />
            {item.type === 'video' && (
                <View style={styles.videoIconContainer}>
                    <Ionicons name="play" size={24} color="#fff" />
                </View>
            )}
        </Pressable>
    );
}, (prev, next) => prev.item.id === next.item.id);

export const MediaGrid: React.FC<MediaGridProps> = ({ data, onMediaPress }) => {
    const renderItem = useCallback(({ item, index }: { item: MediaItem; index: number }) => {
        return <GridItem item={item} index={index} onPress={onMediaPress} />;
    }, [onMediaPress]);

    return (
        <View style={styles.container}>
            <FlashList
                data={data}
                renderItem={renderItem}
                estimatedItemSize={ITEM_SIZE}
                numColumns={COLUMN_COUNT}
                keyExtractor={(item) => item.id}
                // Improve performance
                removeClippedSubviews={true}
                showsVerticalScrollIndicator={false}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    itemContainer: {
        width: ITEM_SIZE,
        height: ITEM_SIZE,
        marginBottom: GAP,
        marginRight: GAP,
        position: 'relative',
        backgroundColor: '#111',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    videoIconContainer: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 12,
        padding: 4,
    },
});
