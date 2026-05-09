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
    <GestureHandlerRootView style={styles.overlay}>
  <View style={styles.backdrop}>
    <View style={styles.modalContainer}>
      <MediaViewer
        items={items}
        initialIndex={initialIndex}
        onClose={onClose}
      />
    </View>
  </View>
</GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',

    // centers viewer
    justifyContent: 'center',
    alignItems: 'center',

    // blur-like spacing effect
    padding: 24,
  },

  modalContainer: {
    width: '100%',
    maxWidth: 1200,
    height: '90%',

    borderRadius: 28,
    overflow: 'hidden',

    // premium glass card
    backgroundColor: 'rgba(18,18,28,0.96)',

    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',

    // shadow
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 40,
    shadowOffset: {
      width: 0,
      height: 12,
    },

    elevation: 20,
  },
}); 