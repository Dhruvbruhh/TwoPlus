import React from "react";
import { View } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { color } from "../../src/lib/theme";
import { GlassDock, type DockIcon } from "../../src/components/GlassDock";

/**
 * Five destinations (the HIG/Material 3 ceiling); Coach and Tools are
 * hidden routes reached from Train and Profile. The bar is the glass dock
 * (src/components/GlassDock): a floating icon dock, not an OS default strip.
 */
export default function TabsLayout() {
  return (
    <Tabs
      backBehavior="history"
      tabBar={(props) => <GlassDock {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.canvas },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: dockIcon("home", "home-outline") }} />
      <Tabs.Screen name="train" options={{ title: "Train", tabBarIcon: dockIcon("barbell", "barbell-outline") }} />
      <Tabs.Screen name="community" options={{ title: "Community", tabBarIcon: dockIcon("people", "people-outline") }} />
      <Tabs.Screen name="nutrition" options={{ title: "Nutrition", tabBarIcon: dockIcon("nutrition", "nutrition-outline") }} />
      <Tabs.Screen
        name="coach"
        options={{
          title: "Coach",
          tabBarItemStyle: { display: "none" },
        }}
      />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: dockIcon("person", "person-outline") }} />
      <Tabs.Screen
        name="tools"
        options={{
          title: "Tools",
          // Sixth destination would break the 5-tab navigation ceiling
          // (HIG/Material 3); calculators live one tap away in Profile,
          // nutrition took the tab slot.
          tabBarItemStyle: { display: "none" },
        }}
      />
    </Tabs>
  );
}

/** Dock glyph: filled when selected. Screens without a tabBarIcon (Coach, Tools) stay out of the dock. */
function dockIcon(on: DockIcon, off: DockIcon) {
  return ({ focused, color: tint }: { focused: boolean; color: unknown }) => (
    <Ionicons name={focused ? on : off} size={23} color={tint as string} />
  );
}

/** Shared bottom padding so no screen hides content behind the floating dock. */
export function tabBarSpace(insetBottom: number) {
  return 104 + Math.max(insetBottom, 0);
}

export function Spacer() {
  return <View style={{ height: 12 }} />;
}
