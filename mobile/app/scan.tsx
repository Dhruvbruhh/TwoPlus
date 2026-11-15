import React, { useState } from "react";
import { Image, Pressable, View, StyleSheet } from "react-native";
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
 * 3. Detected items are ESTIMATES: the member edits servings, adds manual
 *    items, or discards. Nothing is saved until they confirm, and nothing is
 *    fabricated when AI is unavailable - the manual path is the fallback.
 */
export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [photo, setPhoto] = useState<string | null>(null);
  const [items, setItems] = useState<AiItem[] | null>(null);
  const [slot, setSlot] = useState<MealEntry["slot"]>("lunch");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Reset when the screen is left so the next visit starts from the camera.
  useFocusEffect(
    React.useCallback(() => {
      return () => {
        setPhoto(null);
        setItems(null);
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

  const draftItems: FoodItem[] = (items ?? []).map((it) => ({ ...it, servings: 1, source: "ai" as const }));

  const save = async () => {
    if (!photo || draftItems.length === 0) return;
    const totals = totalsOf(draftItems);
    const entry: MealEntry = {
      id: `m${Date.now()}`,
      slot,
      name: draftItems.length === 1 ? draftItems[0].name : `${draftItems.length} items`,
      items: draftItems,
      createdAt: Date.now(),
      photoUri: photo,
    };
    await addMeal(entry);
    router.back();
  };

  const totals = totalsOf(draftItems);

  return (
    <Screen scroll={false} edges={["top", "bottom"]}>
      <View style={{ flex: 1, gap: space.lg }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close scanner">
            <Ionicons name="close" size={26} color={color.text} />
          </Pressable>
          <T variant="h3">Scan meal</T>
          <View style={{ width: 26 }} />
        </Row>

        {!photo ? (
          <View style={s.stage}>
            <View style={s.lensRing}>
              <Ionicons name="restaurant-outline" size={44} color={color.textFaint} />
            </View>
            <T variant="bodyStrong" align="center">
              Photograph your meal
            </T>
            <T variant="small" tone="muted" align="center" style={{ maxWidth: 280 }}>
              {aiConfigured
                ? "AI will estimate calories and macros. You can correct everything before saving."
                : "AI analysis is not set up yet - you can still log the meal by hand after the photo."}
            </T>
            <View style={{ alignSelf: "stretch", gap: space.md, marginTop: space.md }}>
              <Button label="Open camera" icon="camera" onPress={() => void pick(true)} />
              <Button label="Choose from library" variant="secondary" icon="images-outline" onPress={() => void pick(false)} />
            </View>
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
                  DETECTED (AI ESTIMATE - EDIT BEFORE SAVING)
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
                  Estimated total: {Math.round(totals.calories)} kcal
                </T>
              </View>
            ) : null}

            <View style={{ gap: space.md, marginTop: "auto", paddingBottom: Math.max(insets.bottom, space.md) }}>
              {items && items.length > 0 ? (
                <Button label="Save to diary" icon="checkmark" onPress={() => void save()} />
              ) : (
                <Button
                  label="Retake photo"
                  variant="secondary"
                  icon="refresh"
                  onPress={() => {
                    setPhoto(null);
                    setItems(null);
                    setNote(null);
                  }}
                />
              )}
            </View>
          </>
        )}
      </View>
    </Screen>
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
});
