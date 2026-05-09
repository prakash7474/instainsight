import React, { useRef, useState } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  FlatList,
  Dimensions,
  TouchableOpacity,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { Image, ActivityIndicator } from 'react-native';

import type { ComponentType } from 'react';

const { width, height } = Dimensions.get('window');

type StoryItem = {
  uri: string;
  type: 'image' | 'video';
};

export default function StoryModal({
  visible,
  stories,
  initialIndex,
  onClose,
}: {
  visible: boolean;
  stories: StoryItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  const flatListRef = useRef<FlatList<StoryItem> | null>(null);

  const [currentIndex, setCurrentIndex] = useState(initialIndex || 0);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index?: number | null }> }) => {
      if (viewableItems?.length > 0) {
        setCurrentIndex(viewableItems[0].index ?? 0);
      }
    }
  ).current;


  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={30} color="#fff" />
        </TouchableOpacity>

        <FlatList
          ref={flatListRef}
          data={stories}
          horizontal
          pagingEnabled
          initialScrollIndex={initialIndex}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item, index) => `${item.uri}-${index}`}
          renderItem={({ item }) => (
            <View style={styles.page}>
              <StoryViewer item={item} />
            </View>
          )}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{
            itemVisiblePercentThreshold: 50,
          }}
        />

        <View style={styles.bottomBar}>
          <Text style={styles.counter}>
            {currentIndex + 1} / {stories.length}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function StoryViewer({ item }: { item: StoryItem }) {
  if (!item?.uri) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  const isVideo =
    item.type === 'video' ||
    item.uri.endsWith('.mp4') ||
    item.uri.endsWith('.mov');

  return (
    <View style={styles.container}>
      {isVideo ? (
        <Video
          source={{ uri: item.uri }}
          style={styles.media}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay
          isLooping
          useNativeControls
        />
      ) : (
        <Image source={{ uri: item.uri }} style={styles.media} resizeMode="contain" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  page: {
    width,
    height,
    justifyContent: 'center',
    alignItems: 'center',
  },

  closeBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 999,
  },

  bottomBar: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
  },

  counter: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  container: {
    width,
    height,
    justifyContent: 'center',
    alignItems: 'center',
  },

  media: {
    width: width,
    height: height * 0.9,
  },

  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});


