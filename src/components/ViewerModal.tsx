import React, { useRef, useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Modal, Dimensions, Pressable, Text } from 'react-native';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { MediaItem } from '../store/useMediaStore';
import { Ionicons } from '@expo/vector-icons';
import { FlashList, ViewToken } from '@shopify/flash-list';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

interface ViewerModalProps {
    visible: boolean;
    media: MediaItem[];
    initialIndex: number;
    onClose: () => void;
}

const ViewerItem = React.memo(({ item, isActive }: { item: MediaItem; isActive: boolean }) => {
    const videoRef = useRef<Video>(null);

    useEffect(() => {
        if (item.type === 'video' && videoRef.current) {
            if (isActive) {
                videoRef.current.playAsync();
            } else {
                videoRef.current.pauseAsync();
            }
        }
    }, [isActive, item.type]);

    return (
        <View style={styles.itemContainer}>
            {item.type === 'image' ? (
                <Image
                    source={{ uri: item.uri }}
                    style={styles.fullMedia}
                    contentFit="contain"
                    cachePolicy="none" // Viewer gets high-res, save memory on cache
                    transition={200}
                />
            ) : (
                <Video
                    ref={videoRef}
                    source={{ uri: item.uri }}
                    style={styles.fullMedia}
                    resizeMode={ResizeMode.CONTAIN}
                    isLooping
                    shouldPlay={isActive}
                />
            )}
        </View>
    );
}, (prev, next) => prev.item.id === next.item.id && prev.isActive === next.isActive);

export const ViewerModal: React.FC<ViewerModalProps> = ({ visible, media, initialIndex, onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const flashListRef = useRef<FlashList<MediaItem>>(null);

    useEffect(() => {
        if (visible && flashListRef.current) {
            // Small delay to ensure layout is ready
            setTimeout(() => {
                flashListRef.current?.scrollToIndex({ index: initialIndex, animated: false });
            }, 100);
            setCurrentIndex(initialIndex);
        }
    }, [visible, initialIndex]);

    const translateY = useSharedValue(0);

    const panGesture = Gesture.Pan()
        .onChange((event) => {
            // Only allow pulling down to close over a threshold
            if (event.translationY > 0) {
                translateY.value = event.translationY;
            }
        })
        .onEnd((event) => {
            if (event.translationY > 150) {
                runOnJS(onClose)();
            } else {
                translateY.value = withSpring(0);
            }
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
        flex: 1,
    }));

    const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
        if (viewableItems.length > 0) {
            const index = viewableItems[0].index;
            if (index !== null && index !== undefined) {
                setCurrentIndex(index);
            }
        }
    }, []);

    const renderItem = useCallback(({ item, index }: { item: MediaItem; index: number }) => (
        <ViewerItem item={item} isActive={index === currentIndex} />
    ), [currentIndex]);

    const handleClose = useCallback(() => {
        translateY.value = 0;
        onClose();
    }, [onClose, translateY]);

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={handleClose}>
            <GestureHandlerRootView style={styles.modalBackground}>
                <GestureDetector gesture={panGesture}>
                    <Animated.View style={[styles.container, animatedStyle]}>
                        <SafeAreaView style={styles.header}>
                            <Pressable onPress={handleClose} style={styles.closeButton}>
                                <Ionicons name="close" size={28} color="#fff" />
                            </Pressable>
                        </SafeAreaView>

                        <FlashList
                            ref={flashListRef}
                            data={media}
                            renderItem={renderItem}
                            horizontal
                            pagingEnabled
                            showsHorizontalScrollIndicator={false}
                            estimatedItemSize={width}
                            initialScrollIndex={initialIndex}
                            onViewableItemsChanged={onViewableItemsChanged}
                            viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
                            keyExtractor={(item) => item.id}
                            removeClippedSubviews={true}
                        />

                        <SafeAreaView style={styles.footer} edges={['bottom']}>
                            <Text style={styles.counterText}>
                                {currentIndex + 1} / {media.length}
                            </Text>
                        </SafeAreaView>
                    </Animated.View>
                </GestureDetector>
            </GestureHandlerRootView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalBackground: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.95)',
    },
    container: {
        flex: 1,
    },
    itemContainer: {
        width,
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    fullMedia: {
        width: '100%',
        height: '100%',
    },
    header: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        padding: 16,
    },
    closeButton: {
        padding: 8,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 20,
    },
    footer: {
        position: 'absolute',
        bottom: 20,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 10,
    },
    counterText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        textShadowColor: 'rgba(0, 0, 0, 0.75)',
        textShadowOffset: { width: -1, height: 1 },
        textShadowRadius: 10,
    }
});
