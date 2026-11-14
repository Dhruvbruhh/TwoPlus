import React, { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAsync } from "../../src/lib/useAsync";
import { addWater, getMeasurements, getRecentSessions, getWaterLog } from "../../src/lib/data";
import { useAuth } from "../../src/lib/auth";
import {
  ACTIVITY_LEVELS,
  bmi,
  bmiBand,
  bmr,
  formatPace,
  macroSplit,
  oneRepMax,
  paceMinPerKm,
  tdee,
  waterTargetMl,
  type ActivityKey,
  type Sex,
} from "../../src/lib/fitness";
import { Button, Card, Chip, Row, Screen, SectionHeader, T } from "../../src/components/ui";
import { color, radius, space, type } from "../../src/lib/theme";
import { tabBarSpace } from "./_layout";

/**
 * Fitness tools. Every number here comes from `src/lib/fitness.ts`, which uses
 * published formulas (Mifflin-St Jeor, Epley, WHO BMI bands) and states its
 * limits. Nothing is invented, nothing is stored server-side.
 */
export default function ToolsScreen() {
  const { member } = useAuth();
  const insets = useSafeAreaInsets();

  const state = useAsync(
    async () => {
      if (!member) return null;
      const [measurements, sessions, water] = await Promise.all([
        getMeasurements(member.id),
        getRecentSessions(member.id, 7),
        getWaterLog(),
      ]);
      return { measurements, sessions, water };
    },
    [member?.id],
    "tools",
  );

  const latest = state.data?.measurements[0] ?? null;

  // Prefill from the member's own record; every field stays editable.
  const [sex, setSex] = useState<Sex>("male");
  const [age, setAge] = useState("25");
  const [activity, setActivity] = useState<ActivityKey>("moderate");
  const [weight, setWeight] = useState(latest?.weight_kg != null ? String(Number(latest.weight_kg)) : "70");
  const [height, setHeight] = useState(latest?.height_cm != null ? String(Number(latest.height_cm)) : "170");
  const [ormWeight, setOrmWeight] = useState("60");
  const [ormReps, setOrmReps] = useState("5");
  const [runKm, setRunKm] = useState("5");
  const [runMin, setRunMin] = useState("30");

  const calc = useMemo(() => {
    const w = Number(weight);
    const h = Number(height);
    const a = Number(age);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0 || !Number.isFinite(a) || a <= 0) return null;
    const b = bmr({ sex, weightKg: w, heightCm: h, ageYears: a });
    const t = tdee(b, activity);
    return { bmrValue: Math.round(b), tdee: Math.round(t), macros: macroSplit(Math.round(t)), bmiValue: bmi(w, h) };
  }, [sex, weight, height, age, activity]);

  const orm = useMemo(() => {
    const w = Number(ormWeight);
    const r = Number(ormReps);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(r) || r <= 0) return null;
    return oneRepMax(w, Math.round(r));
  }, [ormWeight, ormReps]);

  const run = useMemo(() => {
    const km = Number(runKm);
    const min = Number(runMin);
    if (!Number.isFinite(km) || km <= 0 || !Number.isFinite(min) || min <= 0) return null;
    return paceMinPerKm(km, min * 60);
  }, [runKm, runMin]);

  // Water: today's total against the 35 ml/kg target, +500 on training days.
  const today = new Date().toISOString().slice(0, 10);
  const waterToday = state.data?.water?.[today] ?? 0;
  const trainedToday = (state.data?.sessions ?? []).some((s) => s.performed_on === today && s.completed_at);
  const waterGoal = waterTargetMl(latest?.weight_kg != null ? Number(latest.weight_kg) : null, trainedToday);

  return (
    <Screen contentStyle={{ paddingBottom: tabBarSpace(insets.bottom) }}>
      <View style={{ paddingTop: space.md }}>
        <T variant="h1">Tools</T>
        <T variant="small" tone="muted" style={{ marginTop: 2 }}>
          Published formulas, your numbers, nothing stored.
        </T>
      </View>

      {/* Energy: BMR and TDEE from the member's own stats. */}
      <Card>
        <T variant="caption" tone="faint">YOUR STATS</T>
        <Row gap={space.xs} style={{ marginTop: space.sm, flexWrap: "wrap" }}>
          {(["male", "female", "other"] as Sex[]).map((s) => (
            <Pressable
              key={s}
              onPress={() => setSex(s)}
              accessibilityRole="button"
              accessibilityState={{ selected: sex === s }}
              style={{
                flexGrow: 1,
                minHeight: 36,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: space.lg,
                borderRadius: radius.pill,
                backgroundColor: sex === s ? color.accentSoft : color.surfaceRaised,
              }}
            >
              <T variant="smallStrong" tone={sex === s ? "accent" : "muted"}>
                {s === "male" ? "Male" : s === "female" ? "Female" : "Other"}
              </T>
            </Pressable>
          ))}
        </Row>
        <Row gap={space.sm} style={{ marginTop: space.md }}>
          <Field label="WEIGHT (KG)" value={weight} onChangeText={setWeight} />
          <Field label="HEIGHT (CM)" value={height} onChangeText={setHeight} />
          <Field label="AGE" value={age} onChangeText={setAge} />
        </Row>
        <Row gap={space.xs} style={{ marginTop: space.md, flexWrap: "wrap" }}>
          {(Object.keys(ACTIVITY_LEVELS) as ActivityKey[]).map((k) => (
            <Pressable
              key={k}
              onPress={() => setActivity(k)}
              accessibilityRole="button"
              accessibilityState={{ selected: activity === k }}
              style={{
                flexGrow: 1,
                minHeight: 34,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: space.md,
                paddingVertical: 6,
                borderRadius: radius.pill,
                backgroundColor: activity === k ? color.accentSoft : color.surfaceRaised,
              }}
            >
              <T variant="caption" tone={activity === k ? "accent" : "muted"}>
                {ACTIVITY_LEVELS[k].label}
              </T>
            </Pressable>
          ))}
        </Row>

        {calc ? (
          <Row gap={space.lg} style={{ marginTop: space.xl }}>
            <View style={{ flex: 1 }}>
              <T variant="caption" tone="faint">BMR</T>
              <T variant="h2">{calc.bmrValue}</T>
              <T variant="caption" tone="faint">kcal/day at rest</T>
            </View>
            <View style={{ flex: 1 }}>
              <T variant="caption" tone="faint">TDEE</T>
              <T variant="h2" tone="accent">{calc.tdee}</T>
              <T variant="caption" tone="faint">kcal/day total</T>
            </View>
          </Row>
        ) : null}
        <T variant="caption" tone="faint" style={{ marginTop: space.md }}>
          Mifflin-St Jeor with a Harris-Benedict activity multiplier. An estimate, not a prescription.
        </T>
      </Card>

      {/* BMI with the WHO band. */}
      {calc?.bmiValue ? (
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <View>
              <T variant="caption" tone="faint">BMI</T>
              <T variant="h2">{calc.bmiValue.toFixed(1)}</T>
            </View>
            <Chip label={bmiBand(calc.bmiValue).label} tone={bmiBand(calc.bmiValue).tone} />
          </Row>
          <T variant="caption" tone="faint" style={{ marginTop: space.md }}>
            WHO bands. BMI ignores muscle mass; your coach reads it alongside body fat.
          </T>
        </Card>
      ) : null}

      {/* Macros from TDEE. */}
      {calc ? (
        <Card>
          <T variant="caption" tone="faint">MACROS AT TDEE</T>
          <Row gap={space.lg} style={{ marginTop: space.md }}>
            <View style={{ flex: 1 }}>
              <T variant="caption" tone="faint">PROTEIN</T>
              <T variant="bodyStrong">{calc.macros.protein_g} g</T>
            </View>
            <View style={{ flex: 1 }}>
              <T variant="caption" tone="faint">CARBS</T>
              <T variant="bodyStrong">{calc.macros.carbs_g} g</T>
            </View>
            <View style={{ flex: 1 }}>
              <T variant="caption" tone="faint">FAT</T>
              <T variant="bodyStrong">{calc.macros.fat_g} g</T>
            </View>
          </Row>
          <T variant="caption" tone="faint" style={{ marginTop: space.md }}>
            30/40/30 split. Adjust with your coach; these are estimates.
          </T>
        </Card>
      ) : null}

      {/* Estimated one-rep max, Epley. */}
      <SectionHeader title="Strength" />
      <Card>
        <Row gap={space.sm}>
          <Field label="WEIGHT (KG)" value={ormWeight} onChangeText={setOrmWeight} />
          <Field label="REPS" value={ormReps} onChangeText={setOrmReps} />
        </Row>
        <Row style={{ marginTop: space.md, justifyContent: "space-between" }}>
          <View>
            <T variant="caption" tone="faint">ESTIMATED 1RM</T>
            <T variant="h2">{orm != null ? `${Math.round(orm)} kg` : "—"}</T>
          </View>
          {Number(ormReps) > 12 ? <Chip label="High reps, rough estimate" tone="warning" /> : null}
        </Row>
        <T variant="caption" tone="faint" style={{ marginTop: space.md }}>
          Epley formula. Most accurate at 5 reps or fewer.
        </T>
      </Card>

      {/* Running pace. */}
      <SectionHeader title="Running" />
      <Card>
        <Row gap={space.sm}>
          <Field label="DISTANCE (KM)" value={runKm} onChangeText={setRunKm} />
          <Field label="TIME (MIN)" value={runMin} onChangeText={setRunMin} />
        </Row>
        <View style={{ marginTop: space.md }}>
          <T variant="caption" tone="faint">PACE</T>
          <T variant="h2">{formatPace(run)}</T>
        </View>
      </Card>

      {/* Water: on-device log against the 35 ml/kg target. */}
      <SectionHeader title="Water today" />
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <View>
            <T variant="caption" tone="faint">TODAY</T>
            <T variant="h2">{(waterToday / 1000).toFixed(2)} L</T>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <T variant="caption" tone="faint">GOAL</T>
            <T variant="bodyStrong">{(waterGoal / 1000).toFixed(1)} L</T>
          </View>
        </Row>
        <Row gap={space.sm} style={{ marginTop: space.lg }}>
          {[250, 500, 750].map((ml) => (
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
          <Button
            label="Undo"
            variant="secondary"
            compact
            onPress={async () => {
              await addWater(-250);
              await state.refresh();
            }}
            style={{ flex: 1 }}
          />
        </Row>
        <T variant="caption" tone="faint" style={{ marginTop: space.md }}>
          35 ml per kg bodyweight, +500 ml on training days. Stored on this device only.
        </T>
      </Card>

      {state.error ? (
        <Card>
          <T variant="small" tone="warning">{state.error}</T>
        </Card>
      ) : null}
    </Screen>
  );
}

function Field({ label, value, onChangeText }: { label: string; value: string; onChangeText: (t: string) => void }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <T variant="caption" tone="faint">{label}</T>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        selectTextOnFocus
        style={{
          minHeight: 48,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: color.line,
          backgroundColor: color.surface,
          paddingHorizontal: space.md,
          color: color.text,
          ...type.bodyStrong,
        }}
      />
    </View>
  );
}
