import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { color, glass, gutter, HIT, motion, radius, space, type } from "../lib/theme";
import { haptic, useReducedMotion } from "../lib/feedback";

/**
 * Shared primitives. Every screen composes these rather than styling raw
 * Text/View, which is what keeps spacing and type consistent across tabs.
 *
 * Type is applied here and nowhere else: one `fontFamily` per weight, never
 * `fontWeight` alongside it, because Android resolves that pair inconsistently.
 */

const family = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semi: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

const weightFamily: Record<string, string> = {
  "400": family.regular,
  "500": family.medium,
  "600": family.semi,
  "650": family.semi,
  "700": family.bold,
};

export type Variant = keyof typeof type;

/**
 * Text follows the system font size, bounded per role so a 200% setting
 * grows body copy generously but cannot push a stat row or title off the
 * screen.
 */
const maxScale: Record<Variant, number> = {
  display: 1.2,
  h1: 1.3,
  h2: 1.4,
  h3: 1.6,
  body: 1.8,
  bodyStrong: 1.8,
  small: 1.8,
  smallStrong: 1.8,
  caption: 1.6,
  mono: 1.6,
};
const headings = new Set<Variant>(["display", "h1", "h2", "h3"]);

export function T({
  variant = "body",
  tone = "text",
  style,
  children,
  numberOfLines,
  align,
}: {
  variant?: Variant;
  tone?: "text" | "muted" | "faint" | "accent" | "success" | "danger" | "warning";
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
  numberOfLines?: number;
  align?: "left" | "center" | "right";
}) {
  const base = type[variant];
  const toneColor =
    tone === "text"
      ? color.text
      : tone === "muted"
        ? color.textMuted
        : tone === "faint"
          ? color.textFaint
          : tone === "accent"
            ? color.accentText
            : tone === "success"
              ? color.success
              : tone === "danger"
                ? color.danger
                : color.warning;

  return (
    <Text
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={maxScale[variant]}
      accessibilityRole={headings.has(variant) ? "header" : undefined}
      style={[
        base,
        { fontFamily: weightFamily[String(base.fontWeight)] ?? family.regular, color: toneColor },
        align ? { textAlign: align } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** The CRM's gym photo, frosted once and dimmed; panels above it read as glass. */
export function Backdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={require("../../assets/backdrop.jpg")} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={{ left: "32%" }} blurRadius={10} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: color.scrim }]} />
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const inner = <View style={[s.card, style]}>{children}</View>;
  if (!onPress) return inner;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ color: color.line }}
      style={({ pressed }) => (pressed ? { opacity: 0.92, transform: [{ scale: 0.985 }] } : null)}
    >
      {inner}
    </Pressable>
  );
}

export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  contentStyle,
  edges = ["top"],
}: {
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  edges?: ("top" | "bottom")[];
}) {
  const body = (
    <View style={[{ padding: gutter, gap: space.lg }, contentStyle]}>{children}</View>
  );
  const Container = Platform.OS === "web" ? View : SafeAreaView;
  return (
    <Container style={s.screen} edges={edges}>
      <Backdrop />
      {scroll ? (
        // iOS needs padding so focused inputs clear the keyboard; Android
        // resizes the window itself (adjustResize).
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: space.huge }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // Must be a RefreshControl element itself, not a wrapper: on Android
          // ScrollView clones it with the scroll view as its children, so a
          // wrapper that drops children blanks the whole screen.
          {...(onRefresh && Platform.OS !== "web"
            ? {
                refreshControl: (
                  <RefreshControl
                    refreshing={!!refreshing}
                    onRefresh={onRefresh}
                    tintColor={color.textMuted}
                    colors={[color.accent]}
                    progressBackgroundColor={color.surfaceSolid}
                  />
                ),
              }
            : {})}
        >
          {body}
        </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <View style={{ flex: 1 }}>{body}</View>
      )}
    </Container>
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  style,
  compact,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const inert = disabled || loading;
  // Capsules: primary is a lit white capsule, the rest are pieces of glass.
  const look: ViewStyle =
    variant === "primary"
      ? s.buttonPrimary
      : variant === "secondary"
        ? glass.control
        : variant === "danger"
          ? { ...glass.control, backgroundColor: color.dangerSoft, borderColor: "rgba(240,146,132,0.35)" }
          : { backgroundColor: "transparent" };
  const fg =
    variant === "primary"
      ? color.onAccent
      : variant === "danger"
        ? color.danger
        : color.text;

  return (
    <Pressable
      onPress={
        inert
          ? undefined
          : () => {
              if (variant === "primary" || variant === "danger") haptic.tap();
              onPress();
            }
      }
      disabled={inert}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inert, busy: !!loading }}
      android_ripple={{ color: color.lineStrong }}
      style={({ pressed }) => [
        s.button,
        look,
        {
          minHeight: compact ? HIT - 4 : 52,
          opacity: inert ? 0.5 : pressed ? 0.88 : 1,
          transform: [{ scale: pressed && !inert ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={17} color={fg} style={{ marginRight: space.sm }} /> : null}
          <Text
            maxFontSizeMultiplier={1.5}
            numberOfLines={1}
            style={{
              ...type.bodyStrong,
              fontFamily: family.semi,
              color: fg,
              flexShrink: 1,
            }}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  error,
  style,
  ...props
}: TextInputProps & {
  label: string;
  hint?: string;
  error?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ gap: space.sm }, style]}>
      <T variant="smallStrong" tone="muted">
        {label}
      </T>
      <TextInput
        placeholderTextColor={color.textFaint}
        selectionColor={color.accentBright}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          s.input,
          // Focus: the rim lights up, plus a soft white halo.
          focused ? { borderColor: "rgba(255,255,255,0.7)", boxShadow: "0 0 0 3px rgba(255,255,255,0.18), inset 0 1px 3px rgba(0,0,0,0.35)" } : null,
          error ? { borderColor: color.danger } : null,
        ]}
      />
      {error ? (
        <T variant="small" tone="danger">
          {error}
        </T>
      ) : hint ? (
        <T variant="small" tone="faint">
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.sectionHeader}>
      <T variant="h3">{title}</T>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={12} accessibilityRole="button">
          <T variant="smallStrong" tone="accent">
            {action}
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Chip({
  label,
  tone = "surface",
  icon,
}: {
  label: string;
  tone?: "surface" | "accent" | "success" | "warning" | "danger" | "info";
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const map = {
    surface: { bg: color.surfaceRaised, fg: color.textMuted },
    accent: { bg: color.accentSoft, fg: color.accentText },
    success: { bg: color.successSoft, fg: color.success },
    warning: { bg: color.warningSoft, fg: color.warning },
    danger: { bg: color.dangerSoft, fg: color.danger },
    info: { bg: color.infoSoft, fg: color.info },
  }[tone];

  // A status label: tinted fill and coloured text carry the state; no dot or outline.
  return (
    <View style={[s.chip, { backgroundColor: map.bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={map.fg} style={{ marginRight: 5 }} /> : null}
      <Text maxFontSizeMultiplier={1.4} style={{ ...type.caption, fontFamily: family.semi, color: map.fg }}>
        {label}
      </Text>
    </View>
  );
}

export function Stat({
  label,
  value,
  unit,
  tone = "text",
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "text" | "accent" | "success" | "warning";
}) {
  return (
    <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
      <T variant="caption" tone="faint" numberOfLines={1}>
        {label}
      </T>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
        <T variant="h2" tone={tone} numberOfLines={1}>
          {value}
        </T>
        {unit ? (
          <T variant="caption" tone="faint">
            {unit}
          </T>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The CRM's figures band: solid ink, figures split by rules instead of
 * separate floating cards. Use once per screen for the headline numbers.
 */
export function HeroBand({ items }: { items: { label: string; value: string; unit?: string; note?: string }[] }) {
  return (
    <View style={s.band}>
      {items.map((it, i) => (
        <View
          key={it.label}
          style={[s.bandCell, i > 0 ? { borderLeftWidth: 1, borderLeftColor: "rgba(244,247,246,0.16)" } : null]}
        >
          <T variant="caption" tone="muted" numberOfLines={1}>
            {it.label}
          </T>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
            <T variant="h1" numberOfLines={1} style={{ fontVariant: ["tabular-nums"] }}>
              {it.value}
            </T>
            {it.unit ? (
              <T variant="caption" tone="muted">
                {it.unit}
              </T>
            ) : null}
          </View>
          {it.note ? (
            <T variant="caption" tone="faint" numberOfLines={1}>
              {it.note}
            </T>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function EmptyState({
  icon = "file-tray-outline",
  title,
  body,
  action,
  onAction,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  // Says what is missing and the one thing that fills it; left-aligned like the rest of the screen.
  return (
    <View style={s.empty}>
      <Row gap={space.sm}>
        <Ionicons name={icon} size={18} color={color.textFaint} />
        <T variant="bodyStrong" style={{ flex: 1 }}>
          {title}
        </T>
      </Row>
      <T variant="small" tone="muted">
        {body}
      </T>
      {action && onAction ? (
        <Button label={action} onPress={onAction} variant="secondary" compact style={{ marginTop: space.sm, alignSelf: "flex-start" }} />
      ) : null}
    </View>
  );
}

export function Skeleton({ height = 16, width = "100%" as const, style }: { height?: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const [pulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, pulse]);
  return (
    <Animated.View
      accessibilityLabel="Loading"
      style={[
        { height, width, borderRadius: radius.md, borderCurve: "continuous", backgroundColor: color.surfaceRaised, opacity: pulse },
        style,
      ]}
    />
  );
}

/**
 * Back affordance for screens reached by a push but living in the tab
 * navigator (Coach, Tools): iOS has no hardware back and no swipe-back there.
 */
export function BackButton({ label = "Back" }: { label?: string }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", minHeight: HIT, gap: 2, marginLeft: -6 }, pressed ? { opacity: 0.6 } : null]}
    >
      <Ionicons name="chevron-back" size={22} color={color.accentText} />
      <T variant="bodyStrong" tone="accent">{label}</T>
    </Pressable>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: color.line }} />;
}

/**
 * 0..1 progress bar in the accent colour. The fill eases to its value with a
 * scaleX transform on the native driver (never an animated width), and jumps
 * straight there under Reduce motion.
 */
export function ProgressBar({
  progress,
  style,
}: {
  progress: number;
  style?: StyleProp<ViewStyle>;
}) {
  const clamped = Math.max(0, Math.min(1, progress));
  const reduced = useReducedMotion();
  const [fill] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) {
      fill.setValue(clamped);
      return;
    }
    Animated.timing(fill, { toValue: clamped, duration: motion.slow, useNativeDriver: true }).start();
  }, [clamped, reduced, fill]);
  return (
    <View
      style={[{ height: 6, borderRadius: radius.pill, backgroundColor: color.line, overflow: "hidden" }, style]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <Animated.View
        style={{
          width: "100%",
          height: "100%",
          borderRadius: radius.pill,
          backgroundColor: color.accentBright,
          transformOrigin: "left",
          transform: [{ scaleX: fill }],
        }}
      />
    </View>
  );
}

/**
 * Spotlight pane switcher (Train, Profile), after VengeanceUI's spotlight-navbar.
 * A glass capsule of plain labels; a soft light and a thin bright line sit under
 * the selected label and spring to the next one. Scrolls sideways when large
 * text makes it wider than the screen; announces itself as a tab list.
 */
export function Segmented<K extends string>({
  items,
  value,
  onChange,
}: {
  items: { key: K; label: string }[];
  value: K;
  onChange: (next: K) => void;
}) {
  const reduced = useReducedMotion();
  const [spots, setSpots] = useState<Partial<Record<K, { x: number; w: number }>>>({});
  const [lightX] = useState(() => new Animated.Value(0));
  const placed = useRef(false);
  const active = spots[value];

  useEffect(() => {
    if (!active) return;
    const to = active.x + active.w / 2;
    if (reduced || !placed.current) {
      lightX.setValue(to);
      placed.current = true;
    } else {
      Animated.spring(lightX, { toValue: to, stiffness: 200, damping: 20, mass: 1, useNativeDriver: true }).start();
    }
  }, [active?.x, active?.w, reduced, lightX]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      contentContainerStyle={{ paddingHorizontal: gutter }}
      style={{ marginHorizontal: -gutter, flexGrow: 0 }}
    >
      <View style={s.spotNav}>
        {active ? (
          <>
            <Animated.View pointerEvents="none" style={[s.spotGlow, { transform: [{ translateX: Animated.subtract(lightX, SPOT_GLOW / 2) }] }]} />
            <Animated.View pointerEvents="none" style={[s.spotLine, { transform: [{ translateX: Animated.subtract(lightX, SPOT_LINE / 2) }] }]} />
          </>
        ) : null}
        {items.map((p) => {
          const on = value === p.key;
          return (
            <Pressable
              key={p.key}
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                setSpots((prev) => (prev[p.key]?.x === x && prev[p.key]?.w === width ? prev : { ...prev, [p.key]: { x, w: width } }));
              }}
              onPress={() => {
                if (on) return;
                haptic.selection();
                onChange(p.key);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [s.spotItem, pressed && !on ? { opacity: 0.7 } : null]}
            >
              <T variant="smallStrong" style={{ color: on ? color.text : color.textFaint }}>
                {p.label}
              </T>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const SPOT_GLOW = 120;
const SPOT_LINE = 60;

export function Row({
  children,
  style,
  gap = space.sm,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
}) {
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap, minWidth: 0 }, style]}>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    ...glass.pane,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    padding: space.lg,
    gap: space.xs,
  },
  screen: { flex: 1, backgroundColor: color.canvas },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
  },
  // A lit capsule: white with a faint top-to-bottom fall-off and a crisp top rim.
  buttonPrimary: {
    backgroundColor: color.accent,
    backgroundImage: "linear-gradient(180deg, #FFFFFF 0%, #E4E9EB 100%)",
    boxShadow: "0 6px 18px rgba(0,0,0,0.28), inset 0 1px 0 #FFFFFF, inset 0 -2px 4px rgba(0,0,0,0.1)",
  },
  input: {
    ...glass.well,
    minHeight: 50,
    borderRadius: radius.md,
    borderCurve: "continuous",
    paddingHorizontal: space.lg,
    color: color.text,
    ...type.body,
    fontFamily: family.regular,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: space.sm,
    minHeight: 24,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    boxShadow: "inset 0 1px 0.5px rgba(255,255,255,0.25)",
  },
  band: {
    ...glass.pane,
    flexDirection: "row",
    borderRadius: radius.lg,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  bandCell: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
  },
  spotNav: {
    ...glass.pane,
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  spotItem: { height: 44, paddingHorizontal: space.md, justifyContent: "center" },
  // Soft light rising from the bottom edge under the selected label.
  spotGlow: {
    position: "absolute",
    left: 0,
    top: 0,
    width: SPOT_GLOW,
    height: 44,
    backgroundImage: "radial-gradient(circle at 50% 100%, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 60%)",
  },
  // The thin bright line on the bottom edge.
  spotLine: {
    position: "absolute",
    left: 0,
    bottom: 0,
    width: SPOT_LINE,
    height: 2,
    backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0) 0%, #FFFFFF 50%, rgba(255,255,255,0) 100%)",
  },
  empty: {
    ...glass.pane,
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderCurve: "continuous",
  },
});

export const ui = { family, motion, styles: s };
