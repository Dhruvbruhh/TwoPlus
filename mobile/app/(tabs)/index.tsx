import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
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
} from "../../src/lib/data";
import { clockTime, dayKey, daysLeft, shortDate, streakFrom } from "../../src/lib/format";
import { dailyMissions, progressionFrom, XP_SESSION, XP_VISIT } from "../../src/lib/progression";
import { waterTargetMl } from "../../src/lib/fitness";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  HeroBand,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  Skeleton,
  T,
} from "../../src/components/ui";
import { color, glass, radius, space } from "../../src/lib/theme";
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
      {/* CRM page heading: quiet eyebrow, then a tight title. */}
      <View style={{ paddingTop: space.md }}>
        {state.data?.org ? (
          <T variant="caption" tone="faint" numberOfLines={1} style={{ marginBottom: 6 }}>
            {state.data.org.name}
          </T>
        ) : null}
        <T variant="h1">{member ? `Hi, ${member.first_name}` : "Today"}</T>
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
          {/* Today's training is the screen's one focal point and its only filled button. */}
          {state.data?.plan ? (
            <View style={s.today}>
              <T variant="small" tone="muted">
                Today's workout
              </T>
              <T variant="h2" numberOfLines={2} style={{ marginTop: 2 }}>
                {state.data.plan.plan.name}
              </T>
              <T variant="small" tone="muted" numberOfLines={1} style={{ marginTop: 2 }}>
                {view?.exerciseCount ?? 0} exercises
                {state.data.plan.plan.goal ? ` · ${state.data.plan.plan.goal}` : ""}
                {view?.trainedToday ? " · done today" : ""}
              </T>
              <Button
                label={view?.trainedToday ? "Train again" : "Start workout"}
                onPress={() => router.push("/workout")}
                style={{ marginTop: space.lg }}
              />
            </View>
          ) : (
            <EmptyState
              icon="barbell-outline"
              title="No plan assigned yet"
              body="Your coach has not assigned a workout plan. It will appear here as soon as they do."
            />
          )}

          {/* Membership: one line while it is fine, louder only when it needs action. */}
          <Card>
            {view?.active ? (
              <Row style={{ justifyContent: "space-between" }}>
                <View style={{ flex: 1, paddingRight: space.md }}>
                  <T variant="bodyStrong" numberOfLines={1}>
                    {view.active.plan_name ?? "Membership"}
                  </T>
                  <T
                    variant="small"
                    tone={view.left != null && view.left < 7 ? "warning" : "muted"}
                    style={{ marginTop: 2 }}
                  >
                    {view.left == null
                      ? "No end date on file"
                      : view.left < 0
                        ? `Ended ${shortDate(view.active.end_date)}`
                        : `Renews ${shortDate(view.active.end_date)} · ${view.left} ${view.left === 1 ? "day" : "days"} left`}
                  </T>
                </View>
                {view.active.status !== "active" ? <Chip label={view.active.status} tone="warning" /> : null}
              </Row>
            ) : (
              <T variant="small" tone="muted">
                No membership on file. See the front desk to start one.
              </T>
            )}
          </Card>

          <View style={{ gap: space.sm }}>
            <HeroBand
              items={[
                { label: "Streak", value: String(view?.streak ?? 0), unit: "days" },
                { label: "This month", value: String(view?.visitsThisMonth ?? 0), unit: "visits" },
                {
                  label: "Weight",
                  value: view?.latest?.weight_kg != null ? String(Number(view.latest.weight_kg)) : "—",
                  unit: view?.latest?.weight_kg != null ? "kg" : undefined,
                },
              ]}
            />
            {view?.weightDelta != null && Math.abs(view.weightDelta) >= 0.1 ? (
              <Row gap={space.xs} style={{ paddingHorizontal: space.xs }}>
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
          </View>

          {/* Level: derived from real sessions and visits. */}
          {view?.progression ? (
            <Card>
              <Row style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                <T variant="bodyStrong">
                  Level {view.progression.levelIndex + 1} · {view.progression.levelName}
                </T>
                <T variant="small" tone="muted" style={{ fontVariant: ["tabular-nums"] }}>
                  {view.progression.xp.toLocaleString()} XP
                </T>
              </Row>
              <ProgressBar progress={view.progression.levelProgress} style={{ marginTop: space.md }} />
              <T variant="caption" tone="faint" style={{ marginTop: space.sm }}>
                {view.progression.xpToNext != null
                  ? `${view.progression.xpToNext.toLocaleString()} XP to ${nextLevelName(view.progression.levelIndex)}. ${XP_SESSION} per workout, ${XP_VISIT} per visit.`
                  : "Top level reached"}
              </T>
            </Card>
          ) : null}

          {/* Daily missions: optional, derived, no nagging. */}
          {view?.missions.length ? (
            <Card>
              <T variant="smallStrong" tone="muted">
                Today's missions
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
              <T variant="smallStrong" tone="muted">Water today</T>
              <T variant="small" tone="muted" style={{ fontVariant: ["tabular-nums"] }}>
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
              <Ionicons name="chevron-forward" size={18} color={color.textFaint} />
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

const s = StyleSheet.create({
  // The brightest pane on Home: today's workout is the focal point.
  today: {
    ...glass.pane,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.24)",
    padding: space.lg,
    borderRadius: radius.lg,
    borderCurve: "continuous",
  },
});
