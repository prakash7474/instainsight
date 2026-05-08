import { useMemo } from 'react';
import {
  Gesture,
  type GestureType,
} from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

export type PanZoomCallbacks = {
  onClose?: () => void;
  onIndexPrev?: () => void;
  onIndexNext?: () => void;
};

/**
 * Gesture factory for viewer screens.
 * - Pinch-to-zoom (clamped)
 * - Pan-to-close (downward)
 * - Double-tap to reset zoom
 * - Side fling not used by default (viewer controls navigation via buttons)
 */
export function buildPanZoomGesture({
  zoom,
  translateY,
  callbacks,
}: {
  zoom: SharedValue<number>;
  translateY: SharedValue<number>;
  callbacks?: PanZoomCallbacks;
}) {
  // Local pinch scaling factor is applied directly to `zoom`.
  const baseZoom = useSharedValue(1);

  // Keep stable gesture instance.
  return useMemo(() => {
    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

    const pinch = Gesture.Pinch()
      .onBegin(() => {
        baseZoom.value = zoom.value || 1;
      })
      .onUpdate((e) => {
        const next = baseZoom.value * (e.scale || 1);
        zoom.value = clamp(next, 0.95, 2.5);
      })
      .onEnd(() => {
        // If user never really zoomed, gently snap to 1.
        if (zoom.value < 1.05) zoom.value = withSnap(1, zoom);
      });

    const panDown = Gesture.Pan()
      .onUpdate((e) => {
        // Only consider downward pan when not zoomed in.
        if (zoom.value <= 1.02 && e.translationY > 0) {
          translateY.value = clamp(e.translationY, 0, 180);
        }
      })
      .onEnd((e) => {
        if (zoom.value <= 1.02 && e.translationY > 120) {
          callbacks?.onClose?.();
          translateY.value = 0;
        } else {
          translateY.value = 0;
        }
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDelay(250)
      .onEnd(() => {
        zoom.value = 1;
      });

    return Gesture.Simultaneous(panDown, pinch, doubleTap);
  }, [callbacks, translateY, zoom]);
}

function withSnap(target: number, zoom: SharedValue<number>) {
  // This helper keeps the file free from reanimated imports.
  // For viewers we directly assign in this codebase.
  zoom.value = target;
  return target;
}



