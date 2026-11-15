import React, { useMemo, useState } from "react";
import { Pressable, TextInput, View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { useAsync } from "../../src/lib/useAsync";
import { addWater, getWaterLog, getRecentSessions, getMeasurements } from "../../src/lib/data";
import { waterTargetMl } from "../../src/lib/fitness";
import {
  addMeal,
  calorieTarget,
  deleteMeal,
  getMealHistory,
  getMealsForDay,
  totalsOf,
  updateMealItem,
  MEAL_SLOTS,
  type FoodItem,
  type MealEntry,
} from "../../src/lib/nutrition";
import { useAuth } from "../../src/lib/auth";
import {
  Button,
  Card,
  EmptyState,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  T,
} from "../../src/components/ui";
import { color, radius, space, type } from "../../src/lib/theme";
import { tabBarSpace } from "./_layout";

/**
 * Nutrition: one honest day at a glance. Calories against the FDA baseline
 * target, macro bars in the pastel metric hues (protein blue, carbs peach,
 * fat pink), meals logged on-device, water. The food scanner and a quick
 * manual add feed it; everything is an estimate the member can correct.
 */

type Draft = {
  name: string;
  slot: MealEntry["slot"];
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
};

export default function NutritionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { member } = useAuth();

  const state = useAsync(
    async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [meals, history, water, sessions, measurements] = await Promise.all([
        getMealsForDay(today),
        getMealHistory(14),
        getWaterLog(),
        member ? getRecentSessions(member.id, 7) : Promise.resolve([]),
        member ? getMeasurements(member.id) : Promise.resolve([]),
      ]);
      return { meals, history, water, sessions, measurements };
    },
    [member?.id],
    "nutrition",
  );

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const view = useMemo(() => {
    const d = state.data;
    if (!d) return null;
    const today = new Date().toISOString().slice(0, 10);
    const totals = totalsOf(d.meals.flatMap((m) => m.items));
    const trainedToday = d.sessions.some((s) => s.performed_on === today && s.completed_at);
    const target = calorieTarget(trainedToday);
    const waterToday = d.water?.[today] ?? 0;
    const latestWeight = d.measurements[0]?.weight_kg ?? null;
    const waterGoal = waterTargetMl(latestWeight != null ? Number(latestWeight) : null, trainedToday);
    // "Remaining" never goes negative on the ring: over-eating shows as a
    // full ring plus an over badge, which is calmer than a red deficit.
    const remaining = Math.max(0, target - totals.calories);
    const over = totals.calories > target ? Math.round(totals.calories - target) : 0;
    return { totals, target, remaining, over, waterToday, waterGoal };
  }, [state.data]);

  const quickAdd = async () => {
    if (!draft || !Number(draft.calories)) return;
    const entry: MealEntry = {
      id: `m${Date.now()}`,
      slot: draft.slot,
      name: draft.name.trim() || "Quick add",
      items: [
        {
          name: draft.name.trim() || "Quick add",
          servings: 1,
          calories: Number(draft.calories) || 0,
          protein_g: Number(draft.protein) || 0,
          carbs_g: Number(draft.carbs) || 0,
          fat_g: Number(draft.fat) || 0,
          source: "manual",
        },
      ],
      createdAt: Date.now(),
    };
    await addMeal(entry);
    setDraft(null);
    setAdding(false);
    await state.refresh();
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Screen
      refreshing={state.refreshing}
      onRefresh={() => {
        void state.refresh();
      }}
      contentStyle={{ paddingBottom: tabBarSpace(insets.bottom) }}
    >
      <View style={{ paddingTop: space.md }}>
        <T variant="h1">Nutrition</T>
        <T variant="small" tone="muted" style={{ marginTop: 2 }}>
          Estimates you can correct. Nothing leaves this device.
        </T>
      </View>

      {state.loading ? null : (
        <>
          {/* Calorie ring: the one hero number. */}
          <Card style={{ alignItems: "center", paddingVertical: space.xl }}>
            <CalorieRing
              progress={view ? Math.min(1, view.totals.calories / view.target) : 0}
              value={view ? Math.round(view.totals.calories) : 0}
              target={view?.target ?? 2000}
              over={view?.over ?? 0}
              remaining={view?.remaining ?? 0}
            />
            <Row gap={space.xl} style={{ marginTop: space.lg }}>
              <MacroStat label="Protein" value={view?.totals.protein_g ?? 0} hue={color.blue} />
              <MacroStat label="Carbs" value={view?.totals.carbs_g ?? 0} hue={color.peach} />
              <MacroStat label="Fat" value={view?.totals.fat_g ?? 0} hue={color.pink} />
            </Row>
            {view?.over ? (
              <T variant="caption" tone="warning" style={{ marginTop: space.sm }}>
                {view.over} kcal over target
              </T>
            ) : null}
          </Card>

          {/* Primary actions: scanner first, manual add second. */}
          <Row gap={space.sm}>
            <Button label="Scan meal" icon="camera" onPress={() => router.push("/scan")} style={{ flex: 1 }} />
            <Button
              label="Add manually"
              variant="secondary"
              icon="create-outline"
              onPress={() => {
                setDraft({ name: "", slot: "snack", calories: "", protein: "", carbs: "", fat: "" });
                setAdding(true);
              }}
              style={{ flex: 1 }}
            />
          </Row>

          {/* Water, reusing the home pattern. */}
          <Card>
            <Row style={{ justifyContent: "space-between" }}>
              <T variant="caption" tone="faint">
                WATER TODAY
              </T>
              <T variant="caption" tone="muted">
                {((view?.waterToday ?? 0) / 1000).toFixed(2)} / {((view?.waterGoal ?? 2000) / 1000).toFixed(1)} L
              </T>
            </Row>
            <ProgressBar
              progress={view && view.waterGoal > 0 ? Math.min(1, view.waterToday / view.waterGoal) : 0}
              style={{ marginTop: space.md }}
            />
            <Row gap={space.sm} style={{ marginTop: space.md }}>
              {[250, 500].map((ml) => (
                <Button
                  key={ml}
                  label={`+${ml} ml`}
                  variant="secondary"
                  compact
                  onPress={async () => {
                    await addWater(ml);
                    await state.refresh();
                  }}
                  style={{ flex: 1 }}
                />
              ))}
            </Row>
          </Card>

          {/* Today's meals with per-item correction and delete. */}
          <SectionHeader title="Today's meals" />
          {state.data && state.data.meals.length > 0 ? (
            <View style={{ gap: space.md }}>
              {state.data.meals.map((meal) => {
                const t = totalsOf(meal.items);
                return (
                  <Card key={meal.id}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <View style={{ flex: 1, paddingRight: space.md }}>
                        <T variant="bodyStrong">{meal.name}</T>
                        <T variant="caption" tone="muted" style={{ marginTop: 2 }}>
                          {meal.slot} · {Math.round(t.calories)} kcal
                          {hasAi(meal) ? " · AI estimate" : ""}
                        </T>
                      </View>
                      <Pressable
                        onPress={() => setConfirmDelete(meal.id)}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${meal.name}`}
                      >
                        <Ionicons name="trash-outline" size={19} color={color.textFaint} />
                      </Pressable>
                    </Row>
                    {confirmDelete === meal.id ? (
                      <Row gap={space.sm} style={{ marginTop: space.md }}>
                        <Button
                          label="Delete"
                          variant="danger"
                          compact
                          onPress={async () => {
                            await deleteMeal(meal.id);
                            setConfirmDelete(null);
                            await state.refresh();
                          }}
                          style={{ flex: 1 }}
                        />
                        <Button
                          label="Keep"
                          variant="secondary"
                          compact
                          onPress={() => setConfirmDelete(null)}
                          style={{ flex: 1 }}
                        />
                      </Row>
                    ) : null}
                    {/* Items with servings steppers: correction stays possible
                        after saving, per the design brief. */}
                    {meal.items.map((it, idx) => (
                      <ItemStepper
                        key={`${meal.id}-${idx}`}
                        item={it}
                        onChange={async (next) => {
                          await updateMealItem(meal.id, idx, next);
                          await state.refresh();
                        }}
                      />
                    ))}
                  </Card>
                );
              })}
            </View>
          ) : (
            <EmptyState
              icon="restaurant-outline"
              title="Nothing logged yet"
              body="Scan a meal with the camera or add one manually. Everything stays on this device."
            />
          )}

          {/* Meal history: every logged day except today, newest first. */}
          {state.data && state.data.history.filter((h) => h.day !== today).length > 0 ? (
            <>
              <SectionHeader title="History" />
              <View style={{ gap: space.md }}>
                {state.data.history
                  .filter((h) => h.day !== today)
                  .slice(0, 7)
                  .map((h) => (
                    <Card key={h.day}>
                      <Row style={{ justifyContent: "space-between" }}>
                        <T variant="smallStrong">{dayLabel(h.day)}</T>
                        <T variant="caption" tone="muted">
                          {h.meals.length} {h.meals.length === 1 ? "meal" : "meals"} ·{" "}
                          {Math.round(totalsOf(h.meals.flatMap((m) => m.items)).calories)} kcal
                        </T>
                      </Row>
                    </Card>
                  ))}
              </View>
            </>
          ) : null}
        </>
      )}

      {/* Manual add sheet: minimal fields, honest about being an estimate. */}
      {adding && draft ? (
        <ManualAdd
          draft={draft}
          setDraft={setDraft}
          onSave={quickAdd}
          onClose={() => {
            setAdding(false);
            setDraft(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

function hasAi(meal: MealEntry) {
  return meal.items.some((it) => it.source === "ai");
}

function dayLabel(day: string) {
  const d = new Date(`${day}T12:00:00`);
  const today = new Date().toISOString().slice(0, 10);
  if (day === today) return "Today";
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (day === yesterday) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** SVG ring gauge for calories. Restraint: one ring, no stacked arcs. */
function CalorieRing({
  progress,
  value,
  target,
  over,
  remaining,
}: {
  progress: number;
  value: number;
  target: number;
  over: number;
  remaining: number;
}) {
  const size = 168;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color.line} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={over > 0 ? color.warning : color.accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * clamped} ${c}`}
          // SVG y-axis points down; flip so the ring fills from the top.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ alignItems: "center" }}>
        <T variant="display">{value.toLocaleString()}</T>
        <T variant="caption" tone="faint">
          OF {target.toLocaleString()} KCAL
        </T>
        <T variant="caption" tone={over > 0 ? "warning" : "success"} style={{ marginTop: 2 }}>
          {over > 0 ? "over target" : `${Math.round(remaining)} left`}
        </T>
      </View>
    </View>
  );
}

function MacroStat({ label, value, hue }: { label: string; value: number; hue: string }) {
  return (
    <View style={{ alignItems: "center", gap: 2 }}>
      <T variant="h3">{Math.round(value)} g</T>
      <T variant="caption" style={{ color: hue }}>
        {label.toUpperCase()}
      </T>
    </View>
  );
}

/** One editable food item: servings stepper + per-serving numbers. */
function ItemStepper({ item, onChange }: { item: FoodItem; onChange: (next: { servings: number }) => Promise<void> }) {
  const dec = () => void onChange({ servings: Math.max(0.5, item.servings - 0.5) });
  const inc = () => void onChange({ servings: item.servings + 0.5 });
  return (
    <Row style={{ marginTop: space.md, justifyContent: "space-between" }}>
      <View style={{ flex: 1, paddingRight: space.md }}>
        <T variant="small">{item.name}</T>
        <T variant="caption" tone="muted">
          {item.calories} kcal · P {item.protein_g} · C {item.carbs_g} · F {item.fat_g} per serving
        </T>
      </View>
      <Row gap={space.sm}>
        <Pressable
          onPress={dec}
          accessibilityRole="button"
          accessibilityLabel={`Reduce ${item.name} serving`}
          style={st.stepBtn}
        >
          <Ionicons name="remove" size={16} color={color.text} />
        </Pressable>
        <T variant="smallStrong" style={{ minWidth: 32, textAlign: "center" }}>
          {item.servings}x
        </T>
        <Pressable
          onPress={inc}
          accessibilityRole="button"
          accessibilityLabel={`Add ${item.name} serving`}
          style={st.stepBtn}
        >
          <Ionicons name="add" size={16} color={color.text} />
        </Pressable>
      </Row>
    </Row>
  );
}

/** Manual add overlay: plain fields, saved as a manual (non-AI) entry. */
function ManualAdd({
  draft,
  setDraft,
  onSave,
  onClose,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => Promise<void>;
  onClose: () => void;
}) {
  return (
    <View style={st.sheetWrap}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <View style={st.sheet}>
        <T variant="h3">Add meal</T>
        <Row gap={space.xs} style={{ marginTop: space.md, flexWrap: "wrap" }}>
          {MEAL_SLOTS.map((s) => (
            <Pressable
              key={s}
              onPress={() => setDraft({ ...draft, slot: s })}
              accessibilityRole="button"
              accessibilityState={{ selected: draft.slot === s }}
              style={[st.slotChip, draft.slot === s && { backgroundColor: color.accentSoft }]}
            >
              <T variant="caption" tone={draft.slot === s ? "accent" : "muted"}>
                {s.toUpperCase()}
              </T>
            </Pressable>
          ))}
        </Row>
        <Field label="NAME" value={draft.name} onChangeText={(t) => setDraft({ ...draft, name: t })} />
        <Row gap={space.sm}>
          <Field label="CALORIES" value={draft.calories} onChangeText={(t) => setDraft({ ...draft, calories: t })} />
          <Field label="PROTEIN G" value={draft.protein} onChangeText={(t) => setDraft({ ...draft, protein: t })} />
        </Row>
        <Row gap={space.sm}>
          <Field label="CARBS G" value={draft.carbs} onChangeText={(t) => setDraft({ ...draft, carbs: t })} />
          <Field label="FAT G" value={draft.fat} onChangeText={(t) => setDraft({ ...draft, fat: t })} />
        </Row>
        <Row gap={space.sm} style={{ marginTop: space.md }}>
          <Button label="Cancel" variant="secondary" compact onPress={onClose} style={{ flex: 1 }} />
          <Button label="Save" onPress={onSave} style={{ flex: 1 }} />
        </Row>
      </View>
    </View>
  );
}

function Field({ label, value, onChangeText }: { label: string; value: string; onChangeText: (t: string) => void }) {
  return (
    <View style={{ flex: 1, gap: 4, marginTop: space.md }}>
      <T variant="caption" tone="faint">
        {label}
      </T>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        selectTextOnFocus
        style={{
          minHeight: 46,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: color.line,
          backgroundColor: color.surfaceRaised,
          paddingHorizontal: space.md,
          color: color.text,
          ...type.bodyStrong,
        }}
      />
    </View>
  );
}

const st = StyleSheet.create({
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetWrap: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(35,31,48,0.35)",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  sheet: {
    width: "100%",
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: space.xl,
    paddingBottom: space.xxl + 20,
    gap: 2,
  },
  slotChip: {
    minHeight: 32,
    paddingHorizontal: space.md,
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: color.surfaceRaised,
  },
});
