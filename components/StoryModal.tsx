import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';

import {
  Modal,
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import {
  Video,
  ResizeMode,
  type AVPlaybackStatus,
} from 'expo-av';

const { width, height } = Dimensions.get('window');

const IMAGE_DURATION_MS = 5000;

type StoryItem = {
  uri: string;
  type: 'image' | 'video';
};

type Props = {
  visible: boolean;
  stories: StoryItem[];
  initialIndex: number;
  onClose: () => void;
};

export default function StoryModal({
  visible,
  stories,
  initialIndex,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();

  const [index, setIndex] = useState(initialIndex);
  const [videoLoading, setVideoLoading] = useState(false);

  const videoRef = useRef<Video | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const progress = useRef(new Animated.Value(0)).current;

  const current = stories[index];

  // ---------------- RESET INDEX ----------------

  useEffect(() => {
    if (visible) {
      setIndex(initialIndex);
    }
  }, [visible, initialIndex]);

  // ---------------- CLEAR TIMER ----------------

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ---------------- CLEANUP ----------------

  useEffect(() => {
    return () => {
      clearTimer();

      if (videoRef.current) {
        videoRef.current.pauseAsync();
      }
    };
  }, [clearTimer]);

  // ---------------- NEXT ----------------

  const goNext = useCallback(() => {
    clearTimer();

    if (index >= stories.length - 1) {
      onClose();
      return;
    }

    setIndex(prev => prev + 1);
  }, [index, stories.length, onClose, clearTimer]);

  // ---------------- PREV ----------------

  const goPrev = useCallback(() => {
    clearTimer();

    if (index <= 0) return;

    setIndex(prev => prev - 1);
  }, [index, clearTimer]);

  // ---------------- IMAGE TIMER ----------------

  useEffect(() => {
    clearTimer();

    progress.setValue(0);

    if (!current) return;

    if (current.type === 'image') {
      Animated.timing(progress, {
        toValue: 1,
        duration: IMAGE_DURATION_MS,
        useNativeDriver: false,
      }).start();

      timerRef.current = setTimeout(() => {
        goNext();
      }, IMAGE_DURATION_MS);
    }

    return clearTimer;
  }, [index, current, goNext, clearTimer, progress]);

  // ---------------- VIDEO ----------------

  useEffect(() => {
    if (current?.type === 'video') {
      setVideoLoading(true);

      progress.setValue(0);

      if (videoRef.current) {
        videoRef.current.playAsync();
      }
    }

    return () => {
      if (videoRef.current) {
        videoRef.current.pauseAsync();
      }
    };
  }, [index, current, progress]);

  // ---------------- VIDEO STATUS ----------------

  const onVideoStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;

      setVideoLoading(false);

      if (
        status.durationMillis &&
        status.positionMillis
      ) {
        const value =
          status.positionMillis /
          status.durationMillis;

        progress.setValue(value);
      }

      if (status.didJustFinish) {
        goNext();
      }
    },
    [goNext, progress]
  );

  // ---------------- EMPTY ----------------

  if (!visible) return null;

  if (!stories?.length) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <View
          style={[
            styles.overlay,
            { paddingTop: insets.top },
          ]}
        >
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
          >
            <Ionicons
              name="close"
              size={28}
              color="#fff"
            />
          </TouchableOpacity>

          <View style={styles.center}>
            <Text style={styles.emptyText}>
              No stories available
            </Text>
          </View>
        </View>
      </Modal>
    );
  }

  // ---------------- UI ----------------

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top },
        ]}
      >
        {/* CLOSE BUTTON */}

        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          activeOpacity={0.8}
        >
          <Ionicons
            name="close"
            size={26}
            color="#fff"
          />
        </TouchableOpacity>

        {/* PROGRESS */}

        <View style={styles.progressRow}>
          {stories.map((_, i) => {
            if (i < index) {
              return (
                <View
                  key={i}
                  style={[
                    styles.progressTrack,
                    styles.progressSeen,
                  ]}
                />
              );
            }

            if (i === index) {
              return (
                <View
                  key={i}
                  style={styles.progressTrack}
                >
                  <Animated.View
                    style={[
                      styles.progressActive,
                      {
                        width: progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%'],
                        }),
                      },
                    ]}
                  />
                </View>
              );
            }

            return (
              <View
                key={i}
                style={styles.progressTrack}
              />
            );
          })}
        </View>

        {/* STORY */}

        <View style={styles.page}>
          {/* LOADER */}

          {videoLoading &&
            current?.type === 'video' && (
              <View style={styles.videoLoader}>
                <ActivityIndicator
                  size="large"
                  color="#E040FB"
                />
              </View>
            )}

          {/* STORY BOX */}

          <View style={styles.storyWrapper}>
            <View style={styles.mediaWrapper}>
              {current?.type === 'video' ? (
                <Video
                  ref={videoRef}
                  source={{ uri: current.uri }}
                  style={styles.media}
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay
                  isLooping={false}
                  useNativeControls={
                    Platform.OS === 'web'
                  }
                  onPlaybackStatusUpdate={
                    onVideoStatus
                  }
                  onError={() =>
                    setVideoLoading(false)
                  }
                />
              ) : (
                <Image
                  source={{ uri: current.uri }}
                  style={styles.media}
                  resizeMode="contain"
                />
              )}
            </View>
          </View>

          {/* TAP AREA */}

          <View style={styles.tapRow}>
            <TouchableWithoutFeedback
              onPress={goPrev}
            >
              <View style={styles.tapZone} />
            </TouchableWithoutFeedback>

            <TouchableWithoutFeedback
              onPress={goNext}
            >
              <View style={styles.tapZone} />
            </TouchableWithoutFeedback>
          </View>
        </View>

        {/* FOOTER */}

        <View
          style={[
            styles.bottomBar,
            {
              bottom: insets.bottom + 14,
            },
          ]}
        >
          <Text style={styles.counter}>
            {index + 1} / {stories.length}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#000',
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  emptyText: {
    color: '#999',
    fontSize: 16,
    fontWeight: '600',
  },

  closeBtn: {
    position: 'absolute',
    top: 10,
    right: 16,
    zIndex: 999,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  progressRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 10,
    zIndex: 20,
  },

  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },

  progressSeen: {
    backgroundColor: '#fff',
  },

  progressActive: {
    height: '100%',
    backgroundColor: '#E040FB',
    borderRadius: 20,
  },

  page: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 10,
  },

  // ---------------- 9:16 STORY ----------------

  storyWrapper: {
    width: width * 0.95,
    aspectRatio: 9 / 16,
    maxHeight: height * 0.88,

    borderRadius: 24,
    overflow: 'hidden',

    backgroundColor: '#111',

    borderWidth: 1,
    borderColor: '#2A2A40',

    alignSelf: 'center',
  },

  mediaWrapper: {
    flex: 1,
    padding: 8,
    backgroundColor: '#000',
  },

  media: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
    backgroundColor: '#000',
  },

  videoLoader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },

  tapRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },

  tapZone: {
    flex: 1,
  },

  bottomBar: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 24,
  },

  counter: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});