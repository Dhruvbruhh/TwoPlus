import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { useAuth } from "../src/lib/auth";
import { saveRun } from "../src/lib/data";
import { formatClock, formatPaceShort, runNote, totalKm, type Point } from "../src/lib/run";
import { Button, T } from "../src/components/ui";
import { color, radius, space } from "../src/lib/theme";

/**
 * GPS run tracker.
 *
 * Records the member's own route with expo-location, then saves one real
 * workout session row (duration + a note describing the run). Nothing about
 * the run is simulated: if location is refused the tracker cannot start.
 */
export default function RunScreen() {
  const { member } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [status, setStatus] = useState<"idle" | "tracking" | "saving" | "saved">("idle");
  const [seconds, setSeconds] = useState(0);
  const [points, setPoints] = useState<Point[]>([]);
  const [error, setError] = useState<string | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const secondsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopWatch = useCallback(() => {
    watchRef.current?.remove();
    watchRef.current = null;
  }, []);

  useEffect(() => stopWatch, [stopWatch]);

  const tick = useCallback(() => {
    secondsRef.current += 1;
    setSeconds(secondsRef.current);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      setError("Location permission is needed to track your run.");
      return;
    }
    setStatus("tracking");
    setSeconds(0);
    setPoints([]);
    secondsRef.current = 0;
    const timer = setInterval(tick, 1000);
    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, distanceInterval: 5, timeInterval: 3000 },
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setPoints((prev) => [...prev, { lat: latitude, lon: longitude }]);
      },
    );
    // Keep the interval alongside the watch; cleared when tracking stops.
    timerRef.current = timer;
  }, [tick]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const stop = useCallback(async () => {
    clearTimer();
    stopWatch();
    if (!member) return;
    const km = totalKm(points);
    const secs = secondsRef.current;
    if (km < 0.05 || secs < 30) {
      setStatus("idle");
      Alert.alert("Too short to save", "Runs under 50 m or 30 s are not saved.");
      return;
    }
    setStatus("saving");
    try {
      await saveRun({
        memberId: member.id,
        organizationId: member.organization_id,
        durationMinutes: Math.round(secs / 60),
        note: runNote(km, secs),
      });
      setStatus("saved");
    } catch (e) {
      setStatus("tracking");
      setError(e instanceof Error ? e.message : "Could not save the run.");
    }
  }, [clearTimer, member, points, stopWatch]);

  const km = useMemo(() => totalKm(points), [points]);
  const pace = formatPaceShort(km, seconds);

  if (status === "saved") {
    return (
      <View style={[s.wrap, { paddingTop: insets.top + space.huge }]}>
        <View style={s.badge}>
          <Ionicons name="checkmark" size={34} color={color.success} />
        </View>
        <T variant="h1" style={{ marginTop: space.lg }}>
          Run saved
        </T>
        <T variant="body" tone="muted" align="center" style={{ marginTop: space.sm }}>
          {km.toFixed(2)} km · {formatClock(seconds)}
          {pace ? ` · ${pace}` : ""}
        </T>
        <T variant="caption" tone="faint" align="center" style={{ marginTop: space.xs }}>
          It appears in Train → History
        </T>
        <Button
          label="Done"
          onPress={() => router.back()}
          style={{ marginTop: space.xxl, alignSelf: "stretch", minWidth: 220 }}
        />
      </View>
    );
  }

  return (
    <View style={[s.wrap, { paddingTop: insets.top + space.huge }]}>
      <T variant="caption" tone="faint">
        {status === "tracking" ? "TRACKING" : "OUTDOOR RUN"}
      </T>
      <Text style={s.clock}>{formatClock(seconds)}</Text>
      <View style={s.stats}>
        <View style={s.stat}>
          <T variant="caption" tone="faint">
            DISTANCE
          </T>
          <Text style={s.statValue}>{km.toFixed(2)}</Text>
          <T variant="caption" tone="faint">
            km
          </T>
        </View>
        <View style={s.stat}>
          <T variant="caption" tone="faint">
            PACE
          </T>
          <Text style={s.statValue}>{pace ? pace.split(" /km")[0] : "—"}</Text>
          <T variant="caption" tone="faint">
            min / km
          </T>
        </View>
      </View>

      {error ? (
        <View style={s.errorBox}>
          <Ionicons name="warning-outline" size={16} color={color.warning} />
          <T variant="small" tone="warning" style={{ flex: 1 }}>
            {error}
          </T>
        </View>
      ) : null}

      {status === "tracking" ? (
        <Button label="Finish run" icon="stop" variant="danger" onPress={() => void stop()} style={s.action} />
      ) : (
        <Button label="Start run" icon="play" onPress={() => void start()} style={s.action} />
      )}
      {status === "idle" ? (
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <T variant="small" tone="muted" style={{ marginTop: space.lg }}>
            Back
          </T>
        </Pressable>
      ) : null}
      <T variant="caption" tone="faint" align="center" style={{ marginTop: space.xxl, maxWidth: 280 }}>
        Keep the app open while you run. The route stays on your device; only distance, time and pace are saved.
      </T>
    </View>
  );
}

const s = {
  wrap: {
    flex: 1,
    backgroundColor: color.canvas,
    alignItems: "center" as const,
    paddingHorizontal: space.xl,
    gap: space.md,
  },
  clock: {
    ...{ fontSize: 76, lineHeight: 84, fontWeight: "700" as const, letterSpacing: -2 },
    fontFamily: "Inter_700Bold",
    color: color.text,
    fontVariant: ["tabular-nums" as const],
  },
  stats: {
    flexDirection: "row" as const,
    gap: space.huge,
    marginTop: space.lg,
  },
  stat: { alignItems: "center" as const, gap: 2 },
  statValue: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
    color: color.text,
    fontVariant: ["tabular-nums" as const],
  },
  badge: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    backgroundColor: color.successSoft,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  errorBox: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: space.sm,
    backgroundColor: color.warningSoft,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.md,
    alignSelf: "stretch" as const,
  },
  action: { alignSelf: "stretch" as const, marginTop: space.xl },
};
