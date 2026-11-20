import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * Touch feedback in one place, so every screen speaks the same physical
 * language: a selection tick when something changes, a light tap for a
 * primary action, a success or warning buzz when a save resolves.
 * Haptics are fire-and-forget; a device without a motor just stays quiet.
 */
const on = Platform.OS !== "web";
const quiet = () => {};

export const haptic = {
  selection: () => (on ? void Haptics.selectionAsync().catch(quiet) : undefined),
  tap: () => (on ? void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(quiet) : undefined),
  success: () =>
    on ? void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(quiet) : undefined,
  warning: () =>
    on ? void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(quiet) : undefined,
};

/** The system "Reduce motion" setting, kept live. Animations skip when true. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduced(v))
      .catch(quiet);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
