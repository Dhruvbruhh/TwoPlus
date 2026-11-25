import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { color } from "../lib/theme";
import { haptic, useReducedMotion } from "../lib/feedback";
import { ui } from "./ui";

/**
 * Gooey search, after VengeanceUI's gooey-search (a web component on
 * framer-motion, rebuilt here with Animated). A capsule button stretches into
 * a field, the search icon pops out as its own bubble, and results drop in
 * below as staggered capsules. The web version melts the shapes together with
 * an SVG filter; React Native has no filter for that, so the shapes spring
 * apart without the melt. Search is local and instant: no fake loading.
 */

export type GooeyResult = { key: string; label: string; detail?: string };

const BUBBLE = 46;
const ROW = 52;
const springy = { stiffness: 170, damping: 15, mass: 1 } as const;

export function GooeySearch({
  search,
  onSelect,
  buttonLabel = "Search",
  placeholder = "Type to search",
  maxResults = 4,
}: {
  search: (query: string) => GooeyResult[];
  onSelect: (result: GooeyResult) => void;
  buttonLabel?: string;
  placeholder?: string;
  maxResults?: number;
}) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [full, setFull] = useState(0);
  const grow = useRef(new Animated.Value(0)).current;

  // Debounced so the list does not reshuffle on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const results = useMemo(() => (query ? search(query).slice(0, maxResults) : []), [query, search, maxResults]);

  useEffect(() => {
    if (reduced) grow.setValue(open ? 1 : 0);
    else Animated.spring(grow, { toValue: open ? 1 : 0, stiffness: 160, damping: 20, mass: 1, useNativeDriver: false }).start();
  }, [open, reduced, grow]);

  const collapsed = 190;
  const expanded = Math.max(collapsed, full - BUBBLE - 8);
  const width = grow.interpolate({ inputRange: [0, 1], outputRange: [collapsed, expanded] });
  const bubbleX = grow.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] });

  function close() {
    setOpen(false);
    setText("");
    setQuery("");
  }

  return (
    <View
      style={[s.wrap, { height: BUBBLE, marginBottom: results.length ? results.length * ROW : open && query ? 28 : 0 }]}
      onLayout={(e) => setFull(e.nativeEvent.layout.width)}
    >
      {results.map((r, i) => (
        <ResultPill
          key={r.key}
          index={i}
          result={r}
          width={expanded + BUBBLE + 8}
          reduced={reduced}
          onPress={() => {
            haptic.selection();
            onSelect(r);
            close();
          }}
        />
      ))}

      <Animated.View style={[s.button, { width }]}>
        {open ? (
          <TextInput
            autoFocus
            value={text}
            onChangeText={setText}
            onBlur={() => {
              if (!text.trim()) close();
            }}
            placeholder={placeholder}
            placeholderTextColor="rgba(11,15,17,0.5)"
            selectionColor={color.onAccent}
            returnKeyType="search"
            accessibilityLabel={placeholder}
            style={s.input}
          />
        ) : (
          <Pressable
            onPress={() => {
              haptic.tap();
              setOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={buttonLabel}
            style={s.buttonHit}
          >
            <Ionicons name="search" size={16} color={color.onAccent} style={{ opacity: 0.72 }} />
            <Text maxFontSizeMultiplier={1.4} numberOfLines={1} style={s.buttonText}>
              {buttonLabel}
            </Text>
          </Pressable>
        )}
      </Animated.View>

      {open ? (
        <Animated.View style={[s.bubble, { left: expanded + 8, opacity: grow, transform: [{ translateX: bubbleX }] }]}>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close search" hitSlop={6} style={s.bubbleHit}>
            <Ionicons name={text ? "close" : "search"} size={18} color={color.onAccent} />
          </Pressable>
        </Animated.View>
      ) : null}

      {open && query && !results.length ? (
        <Text style={s.none}>Nothing logged before matches "{query}".</Text>
      ) : null}
    </View>
  );
}

function ResultPill({
  index,
  result,
  width,
  reduced,
  onPress,
}: {
  index: number;
  result: GooeyResult;
  width: number;
  reduced: boolean;
  onPress: () => void;
}) {
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.sequence([Animated.delay(index * 90), Animated.spring(v, { toValue: 1, ...springy, useNativeDriver: true })]).start();
  }, [index, reduced, v]);

  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, (index + 1) * ROW] });
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });

  return (
    <Animated.View style={[s.result, { width, transform: [{ translateY }, { scale }] }]}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Use ${result.label}`} style={s.resultHit}>
        <Text numberOfLines={1} style={s.resultLabel}>
          {result.label}
        </Text>
        {result.detail ? (
          <Text numberOfLines={1} style={s.resultDetail}>
            {result.detail}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { position: "relative", zIndex: 10 },
  button: {
    height: BUBBLE,
    borderRadius: 999,
    backgroundColor: color.accent,
    boxShadow: "0 6px 18px rgba(0,0,0,0.28), inset 0 1px 0 #FFFFFF",
    justifyContent: "center",
    overflow: "hidden",
  },
  buttonHit: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18 },
  buttonText: { color: color.onAccent, opacity: 0.8, fontSize: 14, fontFamily: ui.family.semi },
  input: { flex: 1, paddingHorizontal: 18, color: color.onAccent, fontSize: 15, fontFamily: ui.family.medium },
  bubble: {
    position: "absolute",
    top: 0,
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    backgroundColor: color.accent,
    boxShadow: "0 6px 18px rgba(0,0,0,0.28), inset 0 1px 0 #FFFFFF",
  },
  bubbleHit: { flex: 1, alignItems: "center", justifyContent: "center" },
  result: {
    position: "absolute",
    left: 0,
    top: 0,
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: color.accent,
    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
  },
  resultHit: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18 },
  resultLabel: { flexShrink: 1, color: color.onAccent, fontSize: 14, fontFamily: ui.family.semi },
  resultDetail: { marginLeft: "auto", color: "rgba(11,15,17,0.6)", fontSize: 12, fontFamily: ui.family.medium },
  none: { position: "absolute", top: BUBBLE + 10, left: 4, color: color.textMuted, fontSize: 13, fontFamily: ui.family.regular },
});
