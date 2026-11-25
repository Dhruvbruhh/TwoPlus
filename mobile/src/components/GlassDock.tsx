import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import type { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, glass } from "../lib/theme";
import { haptic, useReducedMotion } from "../lib/feedback";

/**
 * Glass dock tab bar, after VengeanceUI's glass-dock (a web component built on
 * framer-motion, rebuilt here with Animated). Icons only, no names on screen:
 * the selected icon lifts and brightens on a spring and has a small light
 * under it. Screen readers still get each tab's full name.
 */

export type DockIcon = keyof typeof Ionicons.glyphMap;
type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

const ITEM = 44;
const GAP = 14;
const PAD_X = 20;
const spring = { stiffness: 300, damping: 24, mass: 1, useNativeDriver: true } as const;

export function GlassDock({ state, descriptors, emitter, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const routes = state.routes.filter((r) => descriptors[r.key]?.options.tabBarIcon);
  const activeKey = state.routes[state.index]?.key;
  const activeIdx = routes.findIndex((r) => r.key === activeKey);

  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom: Math.max(insets.bottom, 10) + 4 }]}>
      <View style={s.dock} accessibilityRole="tablist">
        {routes.map((route, i) => {
          const { options } = descriptors[route.key];
          const focused = i === activeIdx;
          const label = options.title ?? route.name;
          return (
            <DockItem
              key={route.key}
              focused={focused}
              reduced={reduced}
              label={label}
              icon={options.tabBarIcon!({ focused, color: focused ? color.accentText : color.textFaint, size: 23 })}
              onPress={() => {
                const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                haptic.selection();
                if (!focused && !event.defaultPrevented) navigateToTab(route.key);
              }}
              onLongPress={() => emitter.emit({ type: "tabLongPress", target: route.key })}
            />
          );
        })}
      </View>
    </View>
  );
}

function DockItem({
  focused,
  reduced,
  label,
  icon,
  onPress,
  onLongPress,
}: {
  focused: boolean;
  reduced: boolean;
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const lift = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduced) lift.setValue(focused ? 1 : 0);
    else Animated.spring(lift, { toValue: focused ? 1 : 0, ...spring }).start();
  }, [focused, reduced, lift]);

  const translateY = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  const scale = Animated.multiply(lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }), press);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => Animated.spring(press, { toValue: 0.95, ...spring }).start()}
      onPressOut={() => Animated.spring(press, { toValue: 1, ...spring }).start()}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      hitSlop={{ top: 10, bottom: 10, left: GAP / 2, right: GAP / 2 }}
      style={s.item}
    >
      <Animated.View style={{ transform: [{ translateY }, { scale }] }}>{icon}</Animated.View>
      {/* A small light marks the selected tab. */}
      <View style={[s.dot, { opacity: focused ? 1 : 0 }]} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  // Above the screens: the navigator renders scenes after the bar, so they would otherwise draw on top.
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 100, elevation: 100 },
  dock: {
    ...glass.bar,
    flexDirection: "row",
    alignItems: "center",
    gap: GAP,
    paddingHorizontal: PAD_X,
    paddingVertical: 12,
    borderRadius: 22,
    borderCurve: "continuous",
  },
  item: { width: ITEM, height: ITEM, alignItems: "center", justifyContent: "center" },
  dot: {
    position: "absolute",
    bottom: -4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.accentText,
  },
});
