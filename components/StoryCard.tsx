import React, { memo } from 'react';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';

export type StoryCardProps = {
  uri: string;
  size: number;
  onPress: () => void;
  isVideo?: boolean;
};

export const StoryCard = memo(function StoryCard({ uri, size, onPress }: StoryCardProps) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <View style={styles.wrap}>
        <Image source={{ uri }} style={[styles.thumb, { width: size, height: size }]} resizeMode="cover" />
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#E040FB',
    padding: 3,
    overflow: 'hidden',
  },
  thumb: {
    borderRadius: 999,
    backgroundColor: '#13131F',
  },
});

