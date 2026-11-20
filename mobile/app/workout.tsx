import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/lib/auth";
import { useAsync } from "../src/lib/useAsync";
import {
  finishSession,
  getActiveWorkoutPlan,
  getSets,
  startSession,
  logSet,
  type Exercise,
} from "../src/lib/data";
import { nextSetNumber } from "../src/lib/format";
import { haptic } from "../src/lib/feedback";
import {
  drain,
  isNetworkError,
  readOutbox,
  withPending,
  writeOutbox,
  type PendingSet,
} from "../src/lib/outbox";
import { Button, Card, Chip, EmptyState, Row, Skeleton, T } from "../src/components/ui";
import { color, radius, space, type } from "../src/lib/theme";
import { ui } from "../src/components/ui";

type LoggedSet = {
  exercise_id: string | null;
  exercise_name: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
};

/**
 * The live workout.
 *
 * The session row is created on open (idempotent for the day). Every set is
 * written as it is logged; with no signal it waits in an on-device queue keyed
 * by set number, so a replay rewrites that set instead of adding one. Set
 * numbers are session-wide, matching the web app and the table's unique key.
 * Tapping a logged set loads it for correction; only that set changes.
 */
export default function WorkoutScreen() {
  const { member } = useAuth();
  const router = useRouter();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [openExercise, setOpenExercise] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [reps, setReps] = useState("10");
  const [weight, setWeight] = useState("20");
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [logged, setLogged] = useState<LoggedSet[]>([]);
  const [pending, setPending] = useState<PendingSet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bootstrapped = useRef(false);

  const plan = useAsync(
    async () => {
      if (!member) return null;
      return getActiveWorkoutPlan(member.id);
    },
    [member?.id],
  );

  const send = useCallback(
    (p: Omit<PendingSet, "queuedAt">) =>
      logSet({
        sessionId: p.sessionId,
        exerciseId: p.exerciseId,
        exerciseName: p.exerciseName,
        setNumber: p.setNumber,
        reps: p.reps,
        weightKg: p.weightKg,
      }),
    [],
  );

  /** Replays queued sets; returns what is still waiting. */
  const flush = useCallback(async () => {
    if (!member) return [];
    const queued = await readOutbox(member.id);
    if (!queued.length) return queued;
    const { left, error: why } = await drain(queued, send);
    await writeOutbox(member.id, left);
    setPending(left);
    const sent = queued.slice(0, queued.length - left.length);
    if (sent.length) {
      setLogged((prev) => merge(prev, sent.map(fromPending)));
    }
    if (why && !isNetworkError(why)) setError(`A queued set was refused: ${why}`);
    return left;
  }, [member, send]);

  // Create or resume today's session once the plan is known.
  useEffect(() => {
    if (bootstrapped.current || !member || plan.loading) return;
    bootstrapped.current = true;
    void (async () => {
      setPending(await readOutbox(member.id));
      try {
        const row = await startSession({
          memberId: member.id,
          organizationId: member.organization_id,
          planId: plan.data?.plan.id ?? null,
        });
        setSessionId(row.id);
        // Resume the clock from when the session began, not from this open.
        setStartedAt(row.created_at ? Date.parse(row.created_at) : Date.now());
        const sets = await getSets(row.id);
        setLogged(sets);
        await flush();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start the session.");
      }
    })();
  }, [member, plan.loading, plan.data, flush]);

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  const exercises: Exercise[] = plan.data?.exercises ?? [];
  const all = merge(logged, pending.map(fromPending));
  const setsFor = (ex: Exercise) =>
    all.filter((s) => (s.exercise_id ? s.exercise_id === ex.id : s.exercise_name === ex.exercise_name));
  const isPending = (n: number) => pending.some((p) => p.setNumber === n);

  function startEdit(s: LoggedSet) {
    setEditing(s.set_number);
    setReps(String(s.reps ?? ""));
    setWeight(String(s.weight_kg ?? ""));
    setError(null);
  }

  async function save(ex: Exercise) {
    if (!sessionId || !member) return;
    const r = Number(reps);
    const w = Number(weight.replace(",", "."));
    if (!Number.isInteger(r) || r <= 0 || r > 1000) {
      setError("Enter how many reps you did (a whole number).");
      return;
    }
    if (!Number.isFinite(w) || w < 0 || w > 1000) {
      setError("Enter the weight you used in kg, or 0 for bodyweight.");
      return;
    }
    const item: Omit<PendingSet, "queuedAt"> = {
      sessionId,
      exerciseId: ex.id,
      exerciseName: ex.exercise_name,
      setNumber: editing ?? nextSetNumber(all),
      reps: r,
      weightKg: w,
    };
    setSaving(true);
    setError(null);
    try {
      // Queued sets go first so numbering and order stay intact.
      const waiting = await flush();
      if (waiting.length) throw new Error("Network request failed (earlier sets still queued)");
      await send(item);
      setLogged((prev) => merge(prev, [fromPending({ ...item, queuedAt: 0 })]));
      setEditing(null);
      haptic.success();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save that set.";
      if (isNetworkError(message)) {
        try {
          const next = withPending(await readOutbox(member.id), item);
          await writeOutbox(member.id, next);
          setPending(next);
          setEditing(null);
          setError("No connection: the set is saved on this phone and will sync when you are back online.");
          haptic.warning();
        } catch (qe) {
          setError(qe instanceof Error ? qe.message : message);
        }
      } else {
        // Inputs are kept so the member can correct and retry.
        haptic.warning();
        setError(
          /row-level security/i.test(message) && editing != null
            ? "This set cannot be changed until your gym updates TwoPlus. Log a new set instead."
            : message,
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    if (!sessionId) return;
    setFinishing(true);
    try {
      const waiting = await flush();
      if (waiting.length) {
        setError(`${waiting.length} set${waiting.length === 1 ? " is" : "s are"} still waiting for a connection. Finish when you are back online.`);
        return;
      }
      await finishSession(sessionId, Math.max(1, Math.round(elapsed / 60)));
      haptic.success();
      router.back();
    } catch (e) {
      Alert.alert("Could not finish", e instanceof Error ? e.message : "Try again in a moment.");
    } finally {
      setFinishing(false);
    }
  }

  const total = all.length;
  const waiting = pending.length;
  function confirmClose() {
    if (total === 0) {
      router.back();
      return true;
    }
    Alert.alert(
      "Leave the workout?",
      waiting
        ? `${waiting} set(s) are saved on this phone and will sync next time you open the workout online.`
        : "Your logged sets are saved. You can finish the session later today.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: () => router.back() },
      ],
    );
    return true;
  }

  // Android back button goes through the same confirmation as the close icon.
  // Re-subscribed each render so it always sees the current counts.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", confirmClose);
    return () => sub.remove();
  });

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.canvas }} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ paddingHorizontal: space.xl, paddingTop: space.xl }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Pressable onPress={confirmClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close workout">
              <Ionicons name="close" size={24} color={color.textMuted} />
            </Pressable>
            <View style={{ alignItems: "center" }} accessible accessibilityLabel={`Elapsed ${Math.floor(elapsed / 60)} minutes`}>
              <T variant="caption" tone="faint">
                ELAPSED
              </T>
              <T variant="h2" style={{ fontVariant: ["tabular-nums"] }}>
                {mm}:{ss}
              </T>
            </View>
            <View style={{ width: 24 }} />
          </Row>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: space.xl, gap: space.md }}
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <T variant="h1" numberOfLines={2}>
              {plan.data?.plan.name ?? "Workout"}
            </T>
            <T variant="small" tone="muted" style={{ marginTop: 2 }}>
              {all.length} {all.length === 1 ? "set" : "sets"} logged
              {pending.length ? ` · ${pending.length} waiting to sync` : ""}
            </T>
          </View>

          {plan.loading ? (
            <Skeleton height={200} />
          ) : plan.error && !plan.data ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Could not load your plan"
              body={plan.error}
              action="Try again"
              onAction={plan.reload}
            />
          ) : exercises.length === 0 ? (
            <EmptyState
              icon="barbell-outline"
              title="Nothing to log"
              body="Your coach has not assigned a plan yet. Ask at the desk or your trainer to assign one; it will appear here."
            />
          ) : (
            exercises.map((ex) => {
              const open = openExercise === ex.id;
              const done = setsFor(ex);
              const editingHere = editing != null && done.some((s) => s.set_number === editing);
              return (
                <Card key={ex.id}>
                  <Pressable
                    onPress={() => {
                      setOpenExercise(open ? null : ex.id);
                      setEditing(null);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    accessibilityLabel={`${ex.exercise_name}, ${done.length} sets logged`}
                  >
                    <Row style={{ justifyContent: "space-between" }}>
                      <View style={{ flex: 1, paddingRight: space.sm }}>
                        <T variant="bodyStrong" numberOfLines={2}>
                          {ex.exercise_name}
                        </T>
                        <T variant="caption" tone="faint" style={{ marginTop: 2 }}>
                          {[ex.sets ? `${ex.sets} sets` : null, ex.reps ? `${ex.reps} reps` : null]
                            .filter(Boolean)
                            .join(" · ") || "No target set"}
                        </T>
                      </View>
                      {done.length > 0 ? <Chip label={`${done.length} done`} tone="success" /> : null}
                      <Ionicons
                        name={open ? "chevron-up" : "chevron-down"}
                        size={17}
                        color={color.textFaint}
                        style={{ marginLeft: space.sm }}
                      />
                    </Row>
                  </Pressable>

                  {open ? (
                    <View style={{ marginTop: space.md, gap: space.md }}>
                      {ex.instructions ? (
                        <T variant="small" tone="muted">
                          {ex.instructions}
                        </T>
                      ) : null}

                      {done.length ? (
                        <View style={{ gap: space.xs }}>
                          {done.map((s) => (
                            <Pressable
                              key={s.set_number}
                              onPress={() => startEdit(s)}
                              accessibilityRole="button"
                              accessibilityLabel={`Set ${s.set_number}: ${s.reps ?? 0} reps at ${s.weight_kg ?? 0} kilograms. Tap to correct.`}
                              style={[s_.setRow, editing === s.set_number && s_.setRowOn]}
                            >
                              <T variant="small" style={{ flex: 1 }}>
                                Set {s.set_number} · {s.reps ?? "—"} × {s.weight_kg ?? 0} kg
                              </T>
                              {isPending(s.set_number) ? (
                                <Chip label="Waiting to sync" tone="warning" icon="cloud-upload-outline" />
                              ) : (
                                <Ionicons name="create-outline" size={16} color={color.textFaint} />
                              )}
                            </Pressable>
                          ))}
                        </View>
                      ) : null}

                      <Row gap={space.sm}>
                        <View style={{ flex: 1, gap: 4 }}>
                          <T variant="caption" tone="faint">
                            REPS
                          </T>
                          <TextInput
                            value={reps}
                            onChangeText={setReps}
                            keyboardType="number-pad"
                            selectTextOnFocus
                            style={s_.num}
                            accessibilityLabel="Repetitions"
                          />
                        </View>
                        <View style={{ flex: 1, gap: 4 }}>
                          <T variant="caption" tone="faint">
                            WEIGHT (KG)
                          </T>
                          <TextInput
                            value={weight}
                            onChangeText={setWeight}
                            keyboardType="decimal-pad"
                            selectTextOnFocus
                            style={s_.num}
                            accessibilityLabel="Weight in kilograms"
                          />
                        </View>
                      </Row>
                      <Button
                        label={editingHere ? `Update set ${editing}` : `Log set ${nextSetNumber(all)}`}
                        icon={editingHere ? "checkmark" : "add"}
                        compact
                        loading={saving}
                        disabled={!sessionId}
                        onPress={() => void save(ex)}
                      />
                      {editingHere ? (
                        <Button label="Cancel correction" variant="secondary" compact onPress={() => setEditing(null)} />
                      ) : null}
                    </View>
                  ) : null}
                </Card>
              );
            })
          )}
        </ScrollView>

        <View style={{ paddingHorizontal: space.xl, paddingBottom: space.lg, gap: space.sm }}>
          {error ? (
            <View accessibilityLiveRegion="polite">
              <T variant="small" tone="danger">
                {error}
              </T>
            </View>
          ) : null}
          <Button
            label="Finish workout"
            icon="checkmark"
            loading={finishing}
            disabled={!sessionId}
            onPress={() => void finish()}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function fromPending(p: PendingSet): LoggedSet {
  return {
    exercise_id: p.exerciseId,
    exercise_name: p.exerciseName,
    set_number: p.setNumber,
    reps: p.reps,
    weight_kg: p.weightKg,
  };
}

/** One row per set number; later values win (an edit replaces the set). */
function merge(base: LoggedSet[], next: LoggedSet[]) {
  const map = new Map(base.map((s) => [s.set_number, s]));
  for (const s of next) map.set(s.set_number, s);
  return [...map.values()].sort((a, b) => a.set_number - b.set_number);
}

const s_ = {
  num: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
    paddingHorizontal: space.md,
    color: color.text,
    ...type.bodyStrong,
    fontFamily: ui.family.semi,
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surfaceRaised,
  },
  setRowOn: { borderWidth: 1, borderColor: color.accentBright },
} as const;
