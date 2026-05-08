import React, { memo } from 'react';
import { Image, StyleSheet, TouchableOpacity } from 'react-native';

export type MediaCardProps = {
  uri: string;
  size: number;
  onPress: () => void;
};

export const MediaCard = memo(function MediaCard({ uri, size, onPress }: MediaCardProps) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <Image source={{ uri }} style={[styles.thumb, { width: size, height: size }]} resizeMode="cover" />
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  thumb: {
    borderRadius: 12,
    backgroundColor: '#13131F',
  },
});

