import React, { useState } from "react";
import { Image, Pressable, ScrollView, TextInput, View, StyleSheet } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  addMeal,
  totalsOf,
  MEAL_SLOTS,
  type FoodItem,
  type MealEntry,
} from "../src/lib/nutrition";
import { aiConfigured, type AiItem } from "../src/lib/ai";
import { Button, Card, Row, Screen, T } from "../src/components/ui";
import { color, radius, space } from "../src/lib/theme";

/**
 * Food scanner: camera-first, one honest flow.
 *
 * 1. Pick/capture a meal photo (native camera or library).
 * 2. If AI is configured, request analysis; otherwise say so plainly.
 * Detected items are estimates. Nothing is saved until the member confirms,
 * and manual logging works even when meal analysis is unavailable.
 */
export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [photo, setPhoto] = useState<string | null>(null);
  const [items, setItems] = useState<AiItem[] | null>(null);
  const [manualItems, setManualItems] = useState<FoodItem[]>([]);
  const [manualName, setManualName] = useState("");
  const [manualValues, setManualValues] = useState({ calories: "", protein: "", carbs: "", fat: "" });
  const [slot, setSlot] = useState<MealEntry["slot"]>("lunch");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Reset when the screen is left so the next visit starts from the camera.
  useFocusEffect(
    React.useCallback(() => {
      return () => {
        setPhoto(null);
        setItems(null);
        setManualItems([]);
        setNote(null);
        setBusy(false);
      };
    }, []),
  );

  const pick = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setNote(fromCamera ? "Camera permission is needed to scan meals." : "Photo library access is needed.");
      return;
    }
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true, aspect: [4, 3] })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true, aspect: [4, 3] });
    if (res.canceled || !res.assets[0]) return;
    setPhoto(res.assets[0].uri);
    setItems(null);
    setManualItems([]);
    setNote(null);
    await analyze(res.assets[0].uri);
  };

  const analyze = async (uri: string) => {
    setBusy(true);
    try {
      const { analyzeMealPhoto } = await import("../src/lib/ai");
      const result = await analyzeMealPhoto(uri);
      if (result.available && result.items.length > 0) {
        setItems(result.items);
      } else {
        setNote(
          aiConfigured
            ? "Could not identify that photo. Add the items manually below."
            : "AI analysis is not set up yet. Add the items manually - they save the same way.",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const draftItems: FoodItem[] = [
    ...(items ?? []).map((it) => ({ ...it, servings: 1, source: "ai" as const })),
    ...manualItems,
  ];

  const addManualItem = () => {
    const values = Object.values(manualValues).map(Number);
    if (!manualName.trim() || values.some((value) => !Number.isFinite(value) || value < 0)) return;
    const [calories, protein_g, carbs_g, fat_g] = values;
    setManualItems((current) => [...current, {
      name: manualName.trim(), servings: 1, calories, protein_g, carbs_g, fat_g, source: "manual",
    }]);
    setManualName("");
    setManualValues({ calories: "", protein: "", carbs: "", fat: "" });
  };

  const save = async () => {
    if (!draftItems.length) return;
    // Event handler, not render: the impurity warning is a false positive.
    // oxlint-disable-next-line react/purity
    const createdAt = Date.now();
    const entry: MealEntry = {
      id: `m${createdAt}`,
      slot,
      name: draftItems.length === 1 ? draftItems[0].name : `${draftItems.length} items`,
      items: draftItems,
      createdAt,
      ...(photo ? { photoUri: photo } : {}),
    };
    await addMeal(entry);
    router.back();
  };

  const totals = totalsOf(draftItems);

  return (
    <Screen scroll={false} edges={["top", "bottom"]} contentStyle={{ flex: 1 }}>
      <View style={{ flex: 1, gap: space.lg }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close scanner">
            <Ionicons name="close" size={26} color={color.text} />
          </Pressable>
          <T variant="h3">Log a meal</T>
          <View style={{ width: 26 }} />
        </Row>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: space.lg, paddingBottom: Math.max(insets.bottom, space.md) }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        {!photo ? (
          <View style={s.stage}>
            <View style={s.lensRing}>
              <Ionicons name="restaurant-outline" size={44} color={color.textFaint} />
            </View>
            <T variant="bodyStrong" align="center">
              Photograph your meal or add it manually
            </T>
            <T variant="small" tone="muted" align="center" style={{ maxWidth: 280 }}>
              {aiConfigured
                ? "AI estimates calories and macros. Log foods manually whenever needed."
                : "Meal analysis is not set up yet. Log foods manually, with or without a photo."}
            </T>
            <View style={{ alignSelf: "stretch", gap: space.md, marginTop: space.md }}>
              <Button label="Open camera" icon="camera" onPress={() => void pick(true)} />
              <Button label="Choose from library" variant="secondary" icon="images-outline" onPress={() => void pick(false)} />
              <Button label="Enter meal details" variant="ghost" icon="create-outline" onPress={() => setNote("manual-entry")} />
            </View>
            {note === "manual-entry" ? (
              <ManualEntry
                name={manualName}
                values={manualValues}
                items={manualItems}
                onName={setManualName}
                onValues={setManualValues}
                onAdd={addManualItem}
                onSave={() => void save()}
                onRemove={(index) => setManualItems((current) => current.filter((_, i) => i !== index))}
                canSave={manualItems.length > 0}
              />
            ) : null}
          </View>
        ) : (
          <>
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <Image source={{ uri: photo }} style={{ width: "100%", height: 220 }} accessibilityLabel="Meal photo" />
            </Card>

            <Row gap={space.xs} style={{ flexWrap: "wrap" }}>
              {MEAL_SLOTS.map((sl) => (
                <Pressable
                  key={sl}
                  onPress={() => setSlot(sl)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: slot === sl }}
                  style={[s.slotChip, slot === sl && { backgroundColor: color.accentSoft }]}
                >
                  <T variant="caption" tone={slot === sl ? "accent" : "muted"}>
                    {sl.toUpperCase()}
                  </T>
                </Pressable>
              ))}
            </Row>

            {busy ? (
              <T variant="small" tone="muted">
                Analyzing…
              </T>
            ) : null}
            {note ? (
              <T variant="small" tone="muted">
                {note}
              </T>
            ) : null}

            {items && items.length > 0 ? (
              <View style={{ gap: space.md }}>
                <T variant="caption" tone="faint">
                  DETECTED (AI ESTIMATES)
                </T>
                {items.map((it, i) => (
                  <Card key={`${it.name}-${i}`}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <T variant="bodyStrong" style={{ flex: 1, paddingRight: space.md }}>
                        {it.name}
                      </T>
                      <T variant="smallStrong">{Math.round(it.calories)} kcal</T>
                    </Row>
                    <T variant="caption" tone="muted">
                      P {Math.round(it.protein_g)} g · C {Math.round(it.carbs_g)} g · F {Math.round(it.fat_g)} g
                    </T>
                  </Card>
                ))}
                <T variant="caption" tone="muted">
                  Estimated total: {Math.round(totals.calories)} kcal · serving sizes can be corrected in your diary
                </T>
              </View>
            ) : null}

            <ManualEntry
              name={manualName}
              values={manualValues}
              items={manualItems}
              onName={setManualName}
              onValues={setManualValues}
              onAdd={addManualItem}
              onSave={() => void save()}
              onRemove={(index) => setManualItems((current) => current.filter((_, i) => i !== index))}
              canSave={draftItems.length > 0}
            />

            <View style={{ gap: space.md, marginTop: "auto", paddingBottom: Math.max(insets.bottom, space.md) }}>
              <Button label="Retake photo" variant="secondary" icon="refresh" onPress={() => {
                setPhoto(null);
                setItems(null);
                setManualItems([]);
                setNote(null);
              }} />
            </View>
          </>
        )}
        </ScrollView>
      </View>
    </Screen>
  );
}

function ManualEntry({
  name, values, items, onName, onValues, onAdd, onSave, onRemove, canSave,
}: {
  name: string;
  values: { calories: string; protein: string; carbs: string; fat: string };
  items: FoodItem[];
  onName: (value: string) => void;
  onValues: (value: { calories: string; protein: string; carbs: string; fat: string }) => void;
  onAdd: () => void;
  onSave: () => void;
  onRemove: (index: number) => void;
  canSave: boolean;
}) {
  const fields = [
    ["calories", "Calories", "numeric"],
    ["protein", "Protein g", "decimal-pad"],
    ["carbs", "Carbs g", "decimal-pad"],
    ["fat", "Fat g", "decimal-pad"],
  ] as const;

  return (
    <Card style={{ gap: space.sm }}>
      <T variant="bodyStrong">Add food manually</T>
      {items.map((item, index) => (
        <Row key={`${item.name}-${index}`} style={{ justifyContent: "space-between" }}>
          <T variant="small" style={{ flex: 1 }}>{item.name} · {Math.round(item.calories)} kcal</T>
          <Pressable onPress={() => onRemove(index)} accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`}>
            <Ionicons name="close-circle-outline" size={20} color={color.textMuted} />
          </Pressable>
        </Row>
      ))}
      <TextInput
        value={name}
        onChangeText={onName}
        placeholder="Food name"
        placeholderTextColor={color.textFaint}
        accessibilityLabel="Food name"
        style={s.input}
      />
      <View style={s.fieldGrid}>
        {fields.map(([key, label, keyboardType]) => (
          <View key={key} style={s.fieldCell}>
            <T variant="caption" tone="muted">{label}</T>
            <TextInput
              value={values[key]}
              onChangeText={(value) => onValues({ ...values, [key]: value })}
              placeholder="0"
              placeholderTextColor={color.textFaint}
              keyboardType={keyboardType}
              accessibilityLabel={label}
              style={s.input}
            />
          </View>
        ))}
      </View>
      <Button
        label="Add food"
        variant="secondary"
        icon="add"
        onPress={onAdd}
        disabled={!name.trim() || Object.values(values).some((value) => value === "" || !Number.isFinite(Number(value)) || Number(value) < 0)}
      />
      {canSave ? <Button label="Save to diary" icon="checkmark" onPress={onSave} /> : null}
    </Card>
  );
}

const s = StyleSheet.create({
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
  },
  lensRing: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.sm,
  },
  slotChip: {
    minHeight: 32,
    paddingHorizontal: space.md,
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: color.surfaceRaised,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    color: color.text,
    backgroundColor: color.surfaceRaised,
  },
  fieldGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  fieldCell: { width: "48%", gap: space.xs },
});
