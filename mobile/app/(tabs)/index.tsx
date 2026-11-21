import React, { useMemo } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../src/lib/auth";
import { useAsync } from "../../src/lib/useAsync";
import { haptic } from "../../src/lib/feedback";
import {
  addWater,
  getActiveWorkoutPlan,
  getAttendance,
  getMeasurements,
  getMemberships,
  getMyBookings,
  getOrg,
  getRecentSessions,
  getUpcomingClasses,
  getWaterLog,
  bmiOf,
  formatMoney,
} from "../../src/lib/data";
import { clockTime, dayKey, daysLeft, shortDate, streakFrom } from "../../src/lib/format";
import { dailyMissions, progressionFrom, XP_SESSION, XP_VISIT } from "../../src/lib/progression";
import { waterTargetMl } from "../../src/lib/fitness";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  Skeleton,
  Stat,
  T,
} from "../../src/components/ui";
import { color, radius, space } from "../../src/lib/theme";
import { tabBarSpace } from "./_layout";

/**
 * Home answers three questions before the member taps anything: is my
 * membership live, am I on a streak, and what am I training today. The
 * engagement layer (XP, level, missions, water) is derived from the same real
 * records - no second source of truth, nothing farmed.
 */
export default function HomeScreen() {
  const { member, unclaimed, signOut, error: authError, refreshMember } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const state = useAsync(
    async () => {
      if (!member) return null;
      const [org, memberships, attendance, plan, classes, bookings, measurements, sessions, water] =
        await Promise.all([
          getOrg(member.organization_id),
          getMemberships(member.id),
          getAttendance(member.id, 90),
          getActiveWorkoutPlan(member.id),
          getUpcomingClasses(member.organization_id),
          getMyBookings(member.id),
          getMeasurements(member.id),
          getRecentSessions(member.id, 30),
          getWaterLog(),
        ]);
      return { org, memberships, attendance, plan, classes, bookings, measurements, sessions, water };
    },
    [member?.id, member?.organization_id],
    member ? `home:${member.id}` : undefined,
  );

  const view = useMemo(() => {
    const d = state.data;
    if (!d) return null;

    const active = d.memberships.find((m) => m.status === "active") ?? d.memberships[0] ?? null;
    const left = active ? daysLeft(active.end_date) : null;

    const monthKey = dayKey().slice(0, 7);
    const visitsThisMonth = d.attendance.filter((a) => a.check_in.slice(0, 7) === monthKey).length;

    const latest = d.measurements[0] ?? null;
    const previous = d.measurements[1] ?? null;
    const weightDelta =
      latest?.weight_kg != null && previous?.weight_kg != null
        ? Number(latest.weight_kg) - Number(previous.weight_kg)
        : null;

    const bookedIds = new Set(d.bookings.filter((b) => b.status === "booked").map((b) => b.class_id));
    const nextClass = d.classes[0] ?? null;

    // Engagement: derived from the same records the rest of the app uses.
    const today = dayKey();
    const completedDays = d.sessions
      .filter((s) => s.completed_at != null)
      .map((s) => s.performed_on);
    const visitDays = d.attendance.map((a) => a.check_in.slice(0, 10));
    const progression = progressionFrom({ completedSessionDays: completedDays, visitDays });
    const trainedToday = completedDays.includes(today);
    const visitedToday = visitDays.includes(today);
    const waterToday = d.water?.[today] ?? 0;
    const waterGoal = waterTargetMl(
      latest?.weight_kg != null ? Number(latest.weight_kg) : null,
      trainedToday,
    );
    const missions = dailyMissions({
      hasPlan: !!d.plan,
      trainedToday,
      visitedToday,
      waterMl: waterToday,
      waterGoalMl: waterGoal,
      mealsLoggedToday: 0,
      mealsTarget: 0,
    });

    return {
      active,
      left,
      streak: streakFrom(d.attendance.map((a) => a.check_in)),
      visitsThisMonth,
      latest,
      bmi: bmiOf(latest?.weight_kg ?? null, latest?.height_cm ?? null),
      weightDelta,
      nextClass,
      isBooked: nextClass ? bookedIds.has(nextClass.id) : false,
      exerciseCount: d.plan?.exercises.length ?? 0,
      progression,
      missions,
      waterToday,
      waterGoal,
      trainedToday,
    };
  }, [state.data]);

  if (unclaimed) {
    return (
      <Screen>
        <View style={{ paddingTop: space.xxl }}>
          <T variant="h1">
            Almost there
          </T>
        </View>
        <EmptyState
          icon="link-outline"
          title="Your gym has not linked this email yet"
          body="You are signed in, but we could not link exactly one gym membership to this email. Ask the front desk to check the email on your profile, then tap Check again. If you use another email with your gym, sign out and use that one."
          action="Check again"
          onAction={() => void refreshMember()}
        />
        <Button label="Sign out" variant="secondary" icon="log-out-outline" onPress={() => void signOut()} />
      </Screen>
    );
  }

  if (!member && authError) {
    return (
      <Screen>
        <EmptyState
          icon="cloud-offline-outline"
          title="Could not load your membership"
          body={authError}
          action="Try again"
          onAction={() => void refreshMember()}
        />
      </Screen>
    );
  }

  return (
    <Screen
      refreshing={state.refreshing}
      onRefresh={() => {
        void state.refresh();
      }}
      contentStyle={{ paddingBottom: tabBarSpace(insets.bottom) }}
    >
      <View style={{ paddingTop: space.md }}>
        <T variant="h1">Today</T>
        {state.data?.org ? (
          <T variant="small" tone="muted" style={{ marginTop: 2 }}>
            {member ? `${member.first_name}, ` : ""}
            {state.data.org.name}
          </T>
        ) : null}
      </View>

      {member && member.status !== "active" ? (
        <Card>
          <Row gap={space.sm}>
            <Ionicons name="lock-closed-outline" size={18} color={color.warning} />
            <T variant="small" tone="warning" style={{ flex: 1 }}>
              {member.status === "suspended"
                ? "Your gym has suspended this membership record. You can still see your history; please speak to the front desk before training."
                : "This membership record is archived. Your history stays readable; ask the front desk if you are rejoining."}
            </T>
          </Row>
        </Card>
      ) : null}

      {state.loading ? (
        <>
          <Skeleton height={104} />
          <Skeleton height={72} />
        </>
      ) : (
        <>
          {/* Membership: the one fact that gates everything else. */}
          <Card>
            <Row style={{ justifyContent: "space-between" }}>
              <T variant="caption" tone="faint">
                MEMBERSHIP
              </T>
              {view?.active ? (
                <Chip
                  label={view.active.status === "active" ? "Active" : view.active.status}
                  tone={view.active.status === "active" ? "success" : "warning"}
                />
              ) : (
                <Chip label="None" tone="danger" />
              )}
            </Row>

            {view?.active ? (
              <>
                <T variant="h2" style={{ marginTop: space.sm }}>
                  {view.active.plan_name ?? "Membership"}
                </T>
                <Row style={{ marginTop: space.md, justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <T variant="caption" tone="faint">
                      RENEWS
                    </T>
                    <T variant="bodyStrong">{shortDate(view.active.end_date)}</T>
                  </View>
                  <View style={{ flex: 1 }}>
                    <T variant="caption" tone="faint">
                      PLAN PRICE
                    </T>
                    <T variant="bodyStrong">
                      {view.active.price_minor != null
                        ? formatMoney(view.active.price_minor, state.data?.org?.currency ?? "INR")
                        : "—"}
                    </T>
                  </View>
                  <View style={{ flex: 1 }}>
                    <T variant="caption" tone="faint">
                      {view.left != null && view.left >= 0 ? "DAYS LEFT" : "EXPIRED"}
                    </T>
                    <T
                      variant="bodyStrong"
                      tone={view.left != null && view.left < 7 ? "warning" : "text"}
                    >
                      {view.left != null ? Math.max(0, view.left) : "—"}
                    </T>
                  </View>
                </Row>
              </>
            ) : (
              <T variant="small" tone="muted" style={{ marginTop: space.sm }}>
                No membership on file. See the front desk to start one.
              </T>
            )}
          </Card>

          {/* Today's training: the reason the member opened the app at the gym. */}
          <SectionHeader
            title="Today"
            action={state.data?.plan ? "Open" : undefined}
            onAction={() => router.push("/workout")}
          />
          {state.data?.plan ? (
            <Card onPress={() => router.push("/workout")} accessibilityLabel="Open today's workout">
              <Row style={{ justifyContent: "space-between" }}>
                <View style={{ flex: 1, paddingRight: space.md }}>
                  <T variant="bodyStrong" numberOfLines={1}>
                    {state.data.plan.plan.name}
                  </T>
                  <T variant="small" tone="muted" numberOfLines={1} style={{ marginTop: 2 }}>
                    {view?.exerciseCount ?? 0} exercises
                    {state.data.plan.plan.goal ? ` · ${state.data.plan.plan.goal}` : ""}
                  </T>
                </View>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: radius.pill,
                    backgroundColor: color.accentSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="barbell-outline" size={19} color={color.accentText} />
                </View>
              </Row>
              <Button
                label="Start workout"
                icon="play"
                onPress={() => router.push("/workout")}
                style={{ marginTop: space.lg }}
              />
            </Card>
          ) : (
            <EmptyState
              icon="barbell-outline"
              title="No plan assigned yet"
              body="Your coach has not assigned a workout plan. It will appear here as soon as they do."
            />
          )}

          {/* Level + XP ring: derived from real sessions and visits. */}
          {view?.progression ? (
            <Card>
              <Row style={{ justifyContent: "space-between" }}>
                <View style={{ flex: 1, paddingRight: space.md }}>
                  <T variant="caption" tone="faint">
                    {view.progression.levelName}
                  </T>
                  <T variant="h2">{view.progression.xp.toLocaleString()} XP</T>
                  <T variant="caption" tone="muted" style={{ marginTop: 2 }}>
                    {view.progression.xpToNext != null
                      ? `${view.progression.xpToNext.toLocaleString()} XP to ${nextLevelName(view.progression.levelIndex)}`
                      : "Top level reached"}
                  </T>
                  <ProgressBar
                    progress={view.progression.levelProgress}
                    style={{ marginTop: space.md }}
                  />
                </View>
                <View style={{ alignItems: "flex-end", gap: space.sm }}>
                  <View
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: radius.pill,
                      backgroundColor: color.accentSoft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <T variant="bodyStrong" tone="accent">
                      L{view.progression.levelIndex + 1}
                    </T>
                  </View>
                  <T variant="caption" tone="faint" align="right">
                    {XP_SESSION} XP / workout{"\n"}· {XP_VISIT} / visit
                  </T>
                </View>
              </Row>
            </Card>
          ) : null}

          <Card>
            <Row gap={space.lg}>
              <Stat label="Streak" value={String(view?.streak ?? 0)} unit="days" tone="accent" />
              <Stat label="This month" value={String(view?.visitsThisMonth ?? 0)} unit="visits" />
              <Stat
                label="Weight"
                value={view?.latest?.weight_kg != null ? String(Number(view.latest.weight_kg)) : "—"}
                unit={view?.latest?.weight_kg != null ? "kg" : undefined}
              />
            </Row>
            {view?.weightDelta != null && Math.abs(view.weightDelta) >= 0.1 ? (
              <Row gap={space.xs} style={{ marginTop: space.md }}>
                <Ionicons
                  name={view.weightDelta < 0 ? "trending-down" : "trending-up"}
                  size={14}
                  color={view.weightDelta < 0 ? color.success : color.warning}
                />
                <T variant="caption" tone={view.weightDelta < 0 ? "success" : "warning"}>
                  {Math.abs(view.weightDelta).toFixed(1)} kg since last check-in
                  {view.bmi ? ` · BMI ${view.bmi.toFixed(1)}` : ""}
                </T>
              </Row>
            ) : null}
          </Card>

          {/* Daily missions: optional, derived, no nagging. */}
          {view?.missions.length ? (
            <Card>
              <T variant="caption" tone="faint">
                TODAY'S MISSIONS
              </T>
              <View style={{ marginTop: space.md, gap: space.md }}>
                {view.missions.map((m) => (
                  <Row key={m.key} gap={space.sm} style={{ alignItems: "center" }}>
                    <Ionicons
                      name={m.done ? "checkmark-circle" : "radio-button-off"}
                      size={20}
                      color={m.done ? color.success : color.textFaint}
                    />
                    <View style={{ flex: 1 }}>
                      <T variant="small" tone={m.done ? "success" : "text"}>
                        {m.label}
                      </T>
                      {!m.done && m.progress > 0 ? (
                        <ProgressBar progress={m.progress} style={{ marginTop: 6 }} />
                      ) : null}
                    </View>
                  </Row>
                ))}
              </View>
            </Card>
          ) : null}

          {/* Water: quick add, kept on-device. */}
          <Card>
            <Row style={{ justifyContent: "space-between" }}>
              <T variant="caption" tone="faint">WATER TODAY · ON THIS PHONE</T>
              <T variant="caption" tone="muted">
                {((view?.waterToday ?? 0) / 1000).toFixed(2)} / {((view?.waterGoal ?? 2000) / 1000).toFixed(1)} L
              </T>
            </Row>
            <ProgressBar
              progress={view && view.waterGoal > 0 ? Math.min(1, view.waterToday / view.waterGoal) : 0}
              style={{ marginTop: space.md }}
            />
            <Row gap={space.sm} style={{ marginTop: space.md }}>
              <Button
                label="+250 ml"
                variant="secondary"
                compact
                onPress={async () => {
                  haptic.tap();
                  await addWater(250);
                  await state.refresh();
                }}
                style={{ flex: 1 }}
              />
              <Button
                label="+500 ml"
                variant="secondary"
                compact
                onPress={async () => quickWater(500, state.refresh)}
                style={{ flex: 1 }}
              />
            </Row>
          </Card>

          {/* Outdoor run: GPS tracking, saved as a real session. */}
          <Card onPress={() => router.push("/run")} accessibilityLabel="Start a tracked outdoor run">
            <Row style={{ justifyContent: "space-between" }}>
              <View style={{ flex: 1, paddingRight: space.md }}>
                <T variant="bodyStrong">Outdoor run</T>
                <T variant="small" tone="muted" style={{ marginTop: 2 }}>
                  Track distance, time and pace with GPS
                </T>
              </View>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: radius.pill,
                  backgroundColor: color.accentSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="walk-outline" size={19} color={color.accentText} />
              </View>
            </Row>
          </Card>

          {/* Next class. */}
          {view?.nextClass ? (
            <>
              <SectionHeader title="Next class" />
              <Card>
                <Row style={{ justifyContent: "space-between" }}>
                  <View style={{ flex: 1, paddingRight: space.md }}>
                    <T variant="bodyStrong" numberOfLines={1}>
                      {view.nextClass.name}
                    </T>
                    <T variant="small" tone="muted" style={{ marginTop: 2 }}>
                      {shortDate(view.nextClass.starts_at)} · {clockTime(view.nextClass.starts_at)}
                      {view.nextClass.duration_minutes ? ` · ${view.nextClass.duration_minutes} min` : ""}
                    </T>
                  </View>
                  {view.isBooked ? <Chip label="Booked" tone="success" /> : null}
                </Row>
              </Card>
            </>
          ) : null}
        </>
      )}

      {state.error ? (
        <Card>
          <Row gap={space.sm}>
            <Ionicons name="cloud-offline-outline" size={18} color={color.warning} />
            <T variant="small" tone="warning" style={{ flex: 1 }}>
              {state.error}
            </T>
          </Row>
          <Button
            label="Try again"
            variant="secondary"
            compact
            onPress={state.reload}
            style={{ marginTop: space.md }}
          />
        </Card>
      ) : null}
    </Screen>
  );
}

function nextLevelName(index: number) {
  const names = ["Rising", "Disciplined", "Athlete", "Elite", "Champion", "Legend"];
  return names[index] ?? "the next level";
}

async function quickWater(ml: number, refresh: () => Promise<void>) {
  haptic.tap();
  await addWater(ml);
  await refresh();
}
