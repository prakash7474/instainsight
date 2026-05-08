import React from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import type { ViewerItem } from '@/utils/viewerUtils';
import { StoryViewer } from './StoryViewer';


export type StoryModalProps = {
  visible: boolean;
  items: ViewerItem[];
  initialIndex: number;
  onClose: () => void;
};

export function StoryModal({ visible, items, initialIndex, onClose }: StoryModalProps) {
  if (!visible) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.absolute}>
        <StoryViewer items={items} initialIndex={initialIndex} onClose={onClose} />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  absolute: { ...StyleSheet.absoluteFillObject },
});

