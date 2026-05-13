import React from 'react';
import { TouchableOpacity, Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Item = {
  uri?: string;
  type?: 'image' | 'video';
  label?: string;
};

type StoryCardProps = {
  item: Item;
  index: number;
  onPress: (index: number) => void;
  size?: number;
};

export default function StoryCard({ item, index, onPress, size = 110 }: StoryCardProps) {
  const uri = item.uri || '';
  return (
    <TouchableOpacity
      style={[styles.container, { width: size }]}
      onPress={() => onPress(index)}
      activeOpacity={0.8}
    >
      <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]}>
        <Image
          source={{ uri }}
          style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
          resizeMode="cover"
        />
        {item.type === 'video' && (
          <View style={styles.videoBadge}>
            <Ionicons name="play" size={Math.min(18, size * 0.16)} color="#fff" />
          </View>
        )}
      </View>
      {item.label ? (
        <Text style={[styles.label, { maxWidth: size }]} numberOfLines={1}>
          {item.label}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: 24,
  },
  ring: {
    borderWidth: 3,
    borderColor: '#E040FB',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  image: {},
  label: {
    color: '#fff',
    marginTop: 8,
    fontSize: 13,
  },
  videoBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 20,
    padding: 4,
  },
});
