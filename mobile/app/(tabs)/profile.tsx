import React, { useMemo, useState } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../src/lib/auth";
import { useAsync } from "../../src/lib/useAsync";
import { deleteMyAccount, exportMyData } from "../../src/lib/data";
import {
  addMeasurement,
  getAttendance,
  getMeasurements,
  getMemberships,
  getPayments,
  getOrg,
  formatMoney,
  type Measurement,
} from "../../src/lib/data";
import { humanise, initials, shortDate, streakFrom } from "../../src/lib/format";
import {
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Row,
  Screen,
  SectionHeader,
  Skeleton,
  Stat,
  T,
} from "../../src/components/ui";
import { color, radius, space } from "../../src/lib/theme";
import { tabBarSpace } from "./_layout";

type Pane = "membership" | "payments" | "visits" | "body";

const PANES: { key: Pane; label: string }[] = [
  { key: "membership", label: "Membership" },
  { key: "payments", label: "Payments" },
  { key: "visits", label: "Visits" },
  { key: "body", label: "Body" },
];

/**
 * Profile is the member's own record, read-only by design: the gym owns this
 * data, and letting a member edit their own membership status or attendance
 * would make the audit trail worthless. Contact changes go through the desk.
 */
export default function ProfileScreen() {
  const { member, session, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [pane, setPane] = useState<Pane>("membership");

  const state = useAsync(
    async () => {
      if (!member) return null;
      const [org, memberships, payments, attendance, measurements] = await Promise.all([
        getOrg(member.organization_id),
        getMemberships(member.id),
        getPayments(member.id),
        getAttendance(member.id, 120),
        getMeasurements(member.id),
      ]);
      return { org, memberships, payments, attendance, measurements };
    },
    [member?.id, member?.organization_id],
    "profile",
  );

  const spend = useMemo(
    () =>
      (state.data?.payments ?? [])
        .filter((p) => p.status === "paid")
        .reduce((sum, p) => sum + p.amount_minor, 0),
    [state.data],
  );

  function confirmSignOut() {
    Alert.alert("Sign out?", "You will need your password to sign back in.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
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
        <Row gap={space.md}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: radius.pill,
              backgroundColor: color.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <T variant="h2" tone="accent">
              {initials(member?.first_name ?? null, member?.last_name ?? null)}
            </T>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T variant="h2" numberOfLines={1}>
              {member ? `${member.first_name} ${member.last_name ?? ""}`.trim() : "Member"}
            </T>
            <T variant="small" tone="muted" numberOfLines={1} style={{ marginTop: 2 }}>
              {member?.email ?? session?.user.email ?? ""}
            </T>
          </View>
        </Row>
        <Row gap={space.sm} style={{ marginTop: space.md, flexWrap: "wrap" }}>
          {member?.member_code ? <Chip label={member.member_code} tone="surface" icon="pricetag-outline" /> : null}
          {member ? <Chip label={humanise(member.status)} tone={member.status === "active" ? "success" : "warning"} /> : null}
          {state.data?.org ? <Chip label={state.data.org.name} tone="accent" /> : null}
        </Row>
      </View>

      <Row gap={space.xs} style={{ flexWrap: "wrap" }}>
        {PANES.map((p) => {
          const on = pane === p.key;
          return (
            <Pressable
              key={p.key}
              onPress={() => setPane(p.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={{
                paddingHorizontal: space.lg,
                minHeight: 38,
                justifyContent: "center",
                borderRadius: radius.pill,
                backgroundColor: on ? color.accentSoft : color.surfaceRaised,
                borderWidth: 1,
                borderColor: on ? "rgba(123,92,214,0.4)" : "transparent",
              }}
            >
              <T variant="smallStrong" tone={on ? "accent" : "muted"}>
                {p.label}
              </T>
            </Pressable>
          );
        })}
      </Row>

      {state.loading ? (
        <Skeleton height={200} />
      ) : pane === "membership" ? (
        state.data?.memberships.length ? (
          state.data.memberships.map((m) => (
            <Card key={m.id}>
              <Row style={{ justifyContent: "space-between" }}>
                <T variant="bodyStrong" numberOfLines={1} style={{ flex: 1, paddingRight: space.sm }}>
                  {m.plan_name ?? "Membership"}
                </T>
                <Chip label={humanise(m.status)} tone={m.status === "active" ? "success" : "surface"} />
              </Row>
              <Row style={{ justifyContent: "space-between", marginTop: space.md }}>
                <View>
                  <T variant="caption" tone="faint">
                    STARTED
                  </T>
                  <T variant="small">{shortDate(m.start_date)}</T>
                </View>
                <View>
                  <T variant="caption" tone="faint">
                    ENDS
                  </T>
                  <T variant="small">{shortDate(m.end_date)}</T>
                </View>
                <View>
                  <T variant="caption" tone="faint">
                    PRICE
                  </T>
                  <T variant="small">
                    {m.price_minor != null ? formatMoney(m.price_minor, state.data?.org?.currency ?? "INR") : "—"}
                  </T>
                </View>
              </Row>
            </Card>
          ))
        ) : (
          <EmptyState
            icon="card-outline"
            title="No membership on file"
            body="Once the desk starts a membership it will appear here with its dates and price."
          />
        )
      ) : pane === "payments" ? (
        state.data?.payments.length ? (
          <>
            <Card>
              <Row gap={space.lg}>
                <Stat
                  label="Total paid"
                  value={formatMoney(spend, state.data?.org?.currency ?? "INR")}
                  tone="accent"
                />
                <Stat label="Receipts" value={String(state.data.payments.length)} />
              </Row>
            </Card>
            {state.data.payments.map((p, i) => (
              <View key={p.id}>
                {i > 0 ? <Divider /> : null}
                <Row style={{ justifyContent: "space-between", paddingVertical: space.sm }}>
                  <View style={{ flex: 1, paddingRight: space.sm }}>
                    <T variant="small">{p.description ?? humanise(p.method)}</T>
                    <T variant="caption" tone="faint" style={{ marginTop: 2 }}>
                      {shortDate(p.paid_on)} · {humanise(p.method)}
                    </T>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <T variant="bodyStrong">{formatMoney(p.amount_minor, p.currency ?? "INR")}</T>
                    <Chip
                      label={humanise(p.status)}
                      tone={p.status === "paid" ? "success" : p.status === "pending" ? "warning" : "surface"}
                    />
                  </View>
                </Row>
              </View>
            ))}
          </>
        ) : (
          <EmptyState
            icon="receipt-outline"
            title="No payments yet"
            body="Every fee the desk records against your membership will show up here as a receipt."
          />
        )
      ) : pane === "visits" ? (
        state.data?.attendance.length ? (
          <>
            <Card>
              <Row gap={space.lg}>
                <Stat label="Streak" value={String(streakFrom(state.data.attendance.map((a) => a.check_in)))} unit="days" tone="accent" />
                <Stat label="Logged" value={String(state.data.attendance.length)} unit="visits" />
              </Row>
            </Card>
            {state.data.attendance.slice(0, 30).map((a) => (
              <Card key={a.id}>
                <Row style={{ justifyContent: "space-between" }}>
                  <View>
                    <T variant="small">{shortDate(a.check_in)}</T>
                    <T variant="caption" tone="faint" style={{ marginTop: 2 }}>
                      {humanise(a.method)}
                    </T>
                  </View>
                  <T variant="caption" tone="muted">
                    {a.check_out ? "Checked out" : "In gym"}
                  </T>
                </Row>
              </Card>
            ))}
          </>
        ) : (
          <EmptyState
            icon="calendar-outline"
            title="No visits recorded"
            body="Check in at the desk and your visits will build up here."
          />
        )
      ) : pane === "body" ? (
        <BodyPane
          measurements={state.data?.measurements ?? []}
          memberId={member?.id ?? ""}
          organizationId={member?.organization_id ?? ""}
          onSaved={() => void state.refresh()}
        />
      ) : null}

      <View style={{ marginTop: space.md }}>
        <Button
          label="Fitness tools"
          variant="secondary"
          icon="calculator-outline"
          onPress={() => router.push("/tools")}
        />
        <Button
          label="Sign out"
          variant="secondary"
          icon="log-out-outline"
          onPress={confirmSignOut}
          style={{ marginTop: space.sm }}
        />
        <YourData />
        <T variant="caption" tone="faint" align="center" style={{ marginTop: space.md }}>
          Ask your gym to correct any detail on this page.
        </T>
      </View>
    </Screen>
  );
}

/**
 * Your data: export as a share sheet, then deletion with a typed confirmation.
 * Mirrors the web app's Phase 18 section; the RPC is the same one the web uses.
 */
function YourData() {
  const { signOut } = useAuth();
  const [confirm, setConfirm] = useState("");
  const [working, setWorking] = useState<"" | "export" | "delete">("");

  async function doExport() {
    setWorking("export");
    try {
      const json = await exportMyData();
      const name = `twoplus-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      const { File, Paths } = await import("expo-file-system");
      const { shareAsync } = await import("expo-sharing");
      const file = new File(Paths.cache, name);
      file.write(json);
      await shareAsync(file.uri, { mimeType: "application/json", dialogTitle: name });
    } catch (e) {
      Alert.alert("Export failed", e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setWorking("");
    }
  }

  function doDelete() {
    setWorking("delete");
    void (async () => {
      try {
        await deleteMyAccount();
        // Server-side delete also revokes the session; sign-out clears the
        // local member state so the app returns to the login screen.
        await signOut();
      } catch (e) {
        Alert.alert("Could not delete", e instanceof Error ? e.message : "Something went wrong.");
        setWorking("");
      }
    })();
  }

  const ready = confirm.trim().toUpperCase() === "DELETE";

  return (
    <View
      accessibilityLabel="Your data"
      style={{
        marginTop: space.sm,
        padding: space.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
      }}
    >
      <T variant="bodyStrong">Your data</T>
      <T variant="caption" tone="muted" style={{ marginTop: 4 }}>
        Download everything this app holds about you, or remove your account for
        good. Deleting erases your training log, measurements, bookings, photos
        and this sign-in. Payments and invoices stay with your gym, because they
        are its financial records.
      </T>
      <Button
        label={working === "export" ? "Preparing." : "Export my data"}
        variant="secondary"
        icon="download-outline"
        loading={working === "export"}
        disabled={working === "delete"}
        onPress={() => void doExport()}
        style={{ marginTop: space.md }}
      />
      <T variant="caption" tone="faint" style={{ marginTop: space.md }}>
        To delete, type DELETE below. This cannot be undone.
      </T>
      <TextInput
        value={confirm}
        onChangeText={setConfirm}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="DELETE"
        placeholderTextColor={color.textFaint}
        accessibilityLabel="Type DELETE to confirm account deletion"
        style={{
          minHeight: 44,
          marginTop: space.xs,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: ready ? color.danger : color.line,
          backgroundColor: color.surfaceRaised,
          paddingHorizontal: space.md,
          color: color.text,
        }}
      />
      <Button
        label="Delete my account"
        variant="danger"
        icon="trash-outline"
        loading={working === "delete"}
        disabled={!ready || working === "export"}
        onPress={doDelete}
        style={{ marginTop: space.sm }}
      />
    </View>
  );
}

/**
 * The Body pane: a self-service weight check-in plus the gym's history.
 * Migration 0015 grants members insert/update on their own measurement rows,
 * so this writes directly; every other field stays coach/desk-owned.
 */
function BodyPane({
  measurements,
  memberId,
  organizationId,
  onSaved,
}: {
  measurements: Measurement[];
  memberId: string;
  organizationId: string;
  onSaved: () => void;
}) {
  const latest = measurements[0] ?? null;
  const previous = measurements[1] ?? null;
  const delta =
    latest?.weight_kg != null && previous?.weight_kg != null
      ? Number(latest.weight_kg) - Number(previous.weight_kg)
      : null;

  const [weight, setWeight] = useState(latest?.weight_kg != null ? String(Number(latest.weight_kg)) : "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    const w = Number(weight);
    if (!Number.isFinite(w) || w < 20 || w > 400) {
      setErr("Enter a weight between 20 and 400 kg.");
      return;
    }
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      await addMeasurement({
        memberId,
        organizationId,
        weightKg: w,
        heightCm: latest?.height_cm ?? null,
      });
      setMsg("Check-in saved.");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the check-in.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <View>
            <T variant="caption" tone="faint">LATEST WEIGHT</T>
            <T variant="h2">
              {latest?.weight_kg != null ? `${Number(latest.weight_kg)} kg` : "—"}
            </T>
          </View>
          {delta != null && Math.abs(delta) >= 0.1 ? (
            <Chip
              label={`${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg`}
              tone={delta < 0 ? "success" : "warning"}
            />
          ) : null}
        </Row>
        {latest ? (
          <T variant="caption" tone="faint" style={{ marginTop: space.sm }}>
            Measured {shortDate(latest.measured_on)}
            {latest.body_fat_pct != null ? ` · ${Number(latest.body_fat_pct)}% fat` : ""}
          </T>
        ) : null}

        <Row gap={space.sm} style={{ marginTop: space.lg }}>
          <View style={{ flex: 1, gap: 4 }}>
            <T variant="caption" tone="faint">WEIGHT TODAY (KG)</T>
            <TextInput
              value={weight}
              onChangeText={setWeight}
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
              }}
            />
          </View>
          <View style={{ justifyContent: "flex-end", width: 120 }}>
            <Button label={saving ? "Saving…" : "Check in"} compact loading={saving} onPress={() => void save()} />
          </View>
        </Row>
        {msg ? <T variant="caption" tone="success" style={{ marginTop: space.sm }}>{msg}</T> : null}
        {err ? <T variant="caption" tone="danger" style={{ marginTop: space.sm }}>{err}</T> : null}
      </Card>

      {measurements.length > 1 ? (
        <>
          <SectionHeader title="History" />
          {measurements.slice(1, 12).map((m) => (
            <Card key={m.id}>
              <Row style={{ justifyContent: "space-between" }}>
                <T variant="small">{shortDate(m.measured_on)}</T>
                <T variant="caption" tone="faint">
                  {m.weight_kg != null ? `${Number(m.weight_kg)} kg` : "—"}
                </T>
              </Row>
            </Card>
          ))}
        </>
      ) : null}
      {measurements.length === 0 ? (
        <EmptyState
          icon="body-outline"
          title="No measurements yet"
          body="Log your first weight above; anything your coach records will appear here too."
        />
      ) : null}
    </>
  );
}
