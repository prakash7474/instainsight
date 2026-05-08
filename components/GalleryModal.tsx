import React from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import type { ViewerItem } from '@/utils/viewerUtils';
import { MediaViewer } from '@/components/MediaViewer';


export type GalleryModalProps = {
  visible: boolean;
  items: ViewerItem[];
  initialIndex: number;
  onClose: () => void;
};

export function GalleryModal({ visible, items, initialIndex, onClose }: GalleryModalProps) {
  if (!visible) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.absolute}>
        <MediaViewer items={items} initialIndex={initialIndex} onClose={onClose} />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  absolute: { ...StyleSheet.absoluteFillObject },
});

