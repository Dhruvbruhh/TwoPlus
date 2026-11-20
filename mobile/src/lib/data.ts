import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { getMeals } from "./nutrition";
import { CACHE_PREFIX } from "./useAsync";
import { OUTBOX_PREFIX } from "./outbox";
import { dayKey } from "./format";

export { formatMoney } from "./format";

/**
 * Member-facing reads.
 *
 * Every query here runs under the member's own JWT, so RLS does the tenant
 * filtering. Nothing in this file passes an organization id the client chose:
 * the member's `organization_id` comes from their own row, and the policies
 * reject anything else.
 */

export type Membership = {
  id: string;
  plan_name: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  price_minor: number | null;
};

export type Payment = {
  id: string;
  amount_minor: number;
  currency: string | null;
  method: string | null;
  status: string;
  paid_on: string | null;
  description: string | null;
};

export type Attendance = {
  id: string;
  check_in: string;
  check_out: string | null;
  method: string | null;
};

export type Measurement = {
  id: string;
  measured_on: string;
  weight_kg: number | null;
  height_cm: number | null;
  body_fat_pct: number | null;
  chest_cm: number | null;
  waist_cm: number | null;
  hips_cm: number | null;
  arms_cm: number | null;
  thighs_cm: number | null;
  notes: string | null;
};

export type WorkoutPlan = {
  id: string;
  name: string;
  goal: string | null;
  description: string | null;
};

export type Exercise = {
  id: string;
  plan_id: string;
  day_label: string | null;
  exercise_name: string;
  sets: number | null;
  reps: string | null;
  rest_seconds: number | null;
  instructions: string | null;
  position: number | null;
};

export type WorkoutSession = {
  id: string;
  created_at?: string;
  performed_on: string;
  duration_minutes: number | null;
  note: string | null;
  completed_at: string | null;
  plan_id: string | null;
};

export type DietPlan = {
  id: string;
  name: string;
  description: string | null;
  target_calories: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_fat_g: number | null;
};

export type Meal = {
  id: string;
  plan_id: string;
  name: string;
  timing: string | null;
  coach_notes: string | null;
  position: number | null;
  diet_meal_items: { id: string; food_item: string; portion: string | null; notes: string | null; position: number | null }[];
};

export type ClassRow = {
  id: string;
  name: string;
  starts_at: string;
  duration_minutes: number | null;
  capacity: number | null;
  trainer_id: string | null;
};

export type Org = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  currency: string | null;
  timezone: string | null;
};

export type Staff = { id: string; name: string; job_role: string | null; phone: string | null; email: string | null };

/** Throws on error so screens can catch once, in their loader. */
async function one<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T | null> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as T) ?? null;
}

async function many<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as T[]) ?? [];
}

export async function getOrg(organizationId: string) {
  return one<Org>(
    supabase
      .from("organizations")
      .select("id, name, phone, address, currency, timezone")
      .eq("id", organizationId)
      .maybeSingle(),
  );
}

export async function getMemberships(memberId: string) {
  return many<Membership>(
    supabase
      .from("member_memberships")
      .select("id, plan_name, status, start_date, end_date, price_minor")
      .eq("member_id", memberId)
      .order("start_date", { ascending: false }),
  );
}

export async function getPayments(memberId: string, limit = 24) {
  return many<Payment>(
    supabase
      .from("payments")
      .select("id, amount_minor, currency, method, status, paid_on, description")
      .eq("member_id", memberId)
      .order("paid_on", { ascending: false })
      .limit(limit),
  );
}

export async function getAttendance(memberId: string, limit = 60) {
  return many<Attendance>(
    supabase
      .from("attendance")
      .select("id, check_in, check_out, method")
      .eq("member_id", memberId)
      .order("check_in", { ascending: false })
      .limit(limit),
  );
}

export async function getMeasurements(memberId: string, limit = 40) {
  return many<Measurement>(
    supabase
      .from("fitness_measurements")
      .select(
        "id, measured_on, weight_kg, height_cm, body_fat_pct, chest_cm, waist_cm, hips_cm, arms_cm, thighs_cm, notes",
      )
      .eq("member_id", memberId)
      .order("measured_on", { ascending: false })
      .limit(limit),
  );
}

/**
 * The active workout plan, resolved through the assignment.
 *
 * A member can have several assignments over time; `status = 'active'` plus
 * the most recent `effective_from` is the one their coach means today.
 */
export async function getActiveWorkoutPlan(memberId: string) {
  const assignments = await many<{ plan_id: string; effective_from: string | null }>(
    supabase
      .from("member_workout_assignments")
      .select("plan_id, effective_from")
      .eq("member_id", memberId)
      .eq("status", "active")
      .order("effective_from", { ascending: false })
      .limit(1),
  );
  const planId = assignments[0]?.plan_id;
  if (!planId) return null;

  const plan = await one<WorkoutPlan>(
    supabase.from("workout_plans").select("id, name, goal, description").eq("id", planId).maybeSingle(),
  );
  if (!plan) return null;

  const exercises = await many<Exercise>(
    supabase
      .from("workout_exercises")
      .select("id, plan_id, day_label, exercise_name, sets, reps, rest_seconds, instructions, position")
      .eq("plan_id", planId)
      .order("position", { ascending: true }),
  );

  return { plan, exercises };
}

export async function getActiveDietPlan(memberId: string) {
  const assignments = await many<{ plan_id: string }>(
    supabase
      .from("member_diet_assignments")
      .select("plan_id")
      .eq("member_id", memberId)
      .eq("status", "active")
      .limit(1),
  );
  const planId = assignments[0]?.plan_id;
  if (!planId) return null;

  const plan = await one<DietPlan>(
    supabase
      .from("diet_plans")
      .select("id, name, description, target_calories, target_protein_g, target_carbs_g, target_fat_g")
      .eq("id", planId)
      .maybeSingle(),
  );
  if (!plan) return null;

  const meals = await many<Meal>(
    supabase
      .from("diet_meals")
      .select("id, plan_id, name, timing, coach_notes, position, diet_meal_items(id, food_item, portion, notes, position)")
      .eq("plan_id", planId)
      .order("position", { ascending: true }),
  );

  return { plan, meals };
}

export async function getUpcomingClasses(organizationId: string) {
  return many<ClassRow>(
    supabase
      .from("classes")
      .select("id, name, starts_at, duration_minutes, capacity, trainer_id")
      .eq("organization_id", organizationId)
      .gte("starts_at", new Date().toISOString())
      // scheduled only: book_class rejects anything else ("not open for
      // booking"), so showing an active class just hands the member an error.
      .eq("status", "scheduled")
      .order("starts_at", { ascending: true })
      .limit(20),
  );
}

export async function getMyBookings(memberId: string) {
  return many<{ id: string; class_id: string; status: string }>(
    supabase.from("class_bookings").select("id, class_id, status").eq("member_id", memberId),
  );
}

/** Seats taken per class, computed server-side by the 0013 RPC. */
export async function getClassSeats() {
  const { data, error } = await supabase.rpc("class_seats");
  if (error) return new Map<string, number>();
  return new Map((data as { class_id: string; booked: number }[]).map((r) => [r.class_id, r.booked]));
}

export async function bookClass(classId: string) {
  const { error } = await supabase.rpc("book_class", { p_class_id: classId });
  if (error) throw new Error(error.message);
}

export async function cancelBooking(classId: string) {
  const { error } = await supabase.rpc("cancel_class_booking", { p_class_id: classId });
  if (error) throw new Error(error.message);
}

export async function getRecentSessions(memberId: string, limit = 30) {
  return many<WorkoutSession>(
    supabase
      .from("workout_sessions")
      .select("id, performed_on, duration_minutes, note, completed_at, plan_id")
      .eq("member_id", memberId)
      .order("performed_on", { ascending: false })
      .limit(limit),
  );
}

/**
 * Start (or resume) today's session.
 *
 * The unique index on (member_id, performed_on, assignment) makes this
 * idempotent: a double tap returns the row that already exists instead of
 * creating a second one.
 */
export async function startSession(input: {
  memberId: string;
  organizationId: string;
  planId: string | null;
  assignmentId?: string | null;
}) {
  const today = dayKey();
  const cols = "id, created_at, performed_on, duration_minutes, note, completed_at, plan_id";
  const find = () =>
    many<WorkoutSession>(
      supabase
        .from("workout_sessions")
        .select(cols)
        .eq("member_id", input.memberId)
        .eq("performed_on", today)
        .is("assignment_id", input.assignmentId ?? null)
        .limit(1),
    );
  const existing = await find();
  if (existing[0]) return existing[0];

  const { data, error } = await supabase
    .from("workout_sessions")
    .insert({
      member_id: input.memberId,
      organization_id: input.organizationId,
      plan_id: input.planId,
      assignment_id: input.assignmentId ?? null,
      performed_on: today,
    })
    .select(cols)
    .single();
  if (error?.code === "23505") {
    // A second tap (or another device) created today's row first: use it.
    const again = await find();
    if (again[0]) return again[0];
  }
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not start the session");
  return data as WorkoutSession;
}

export async function logSet(input: {
  sessionId: string;
  exerciseId: string | null;
  exerciseName: string;
  setNumber: number;
  reps: number;
  weightKg: number;
}) {
  const { error } = await supabase.from("workout_sets").upsert(
    {
      session_id: input.sessionId,
      exercise_id: input.exerciseId,
      exercise_name: input.exerciseName,
      set_number: input.setNumber,
      reps: input.reps,
      weight_kg: input.weightKg,
    },
    { onConflict: "session_id,set_number" },
  );
  if (error) throw new Error(error.message);
}

export async function getSets(sessionId: string) {
  return many<{
    id: string;
    exercise_id: string | null;
    exercise_name: string;
    set_number: number;
    reps: number | null;
    weight_kg: number | null;
  }>(
    supabase
      .from("workout_sets")
      .select("id, exercise_id, exercise_name, set_number, reps, weight_kg")
      .eq("session_id", sessionId)
      .order("set_number", { ascending: true }),
  );
}

export async function finishSession(sessionId: string, durationMinutes: number, note?: string) {
  const { error } = await supabase
    .from("workout_sessions")
    .update({
      duration_minutes: Math.max(0, Math.min(1440, Math.round(durationMinutes))),
      note: note?.slice(0, 2000) ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}

export async function markNotificationRead(id: string) {
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Could not mark that message as read.");
}

export type Invoice = {
  id: string;
  invoice_number: string;
  issued_on: string;
  due_on: string | null;
  total_minor: number;
  status: string;
  payments: { amount_minor: number; status: string }[];
};

/**
 * The member's own invoices with their allocations. Readable once migration
 * 0018 ("invoices read self") is applied; before that RLS returns no rows, so
 * the UI must not present an empty list as "nothing owed" (see profile.tsx).
 */
export async function getInvoices(memberId: string, limit = 50) {
  return many<Invoice>(
    supabase
      .from("invoices")
      .select("id, invoice_number, issued_on, due_on, total_minor, status, payments(amount_minor, status)")
      .eq("member_id", memberId)
      .order("issued_on", { ascending: false })
      .limit(limit),
  );
}

/**
 * Private progress photos, same bucket and path shape as the web app
 * (`<org>/<member>/<uuid>.jpg`). Signed URLs live ten minutes and are never
 * cached or exported.
 */
const PROGRESS_BUCKET = "member-progress";

export type ProgressPhoto = { id: string; taken_on: string; storage_path: string; note: string | null; url: string | null };

export async function getProgressPhotos(organizationId: string, memberId: string, limit = 24) {
  const rows = await many<Omit<ProgressPhoto, "url">>(
    supabase
      .from("member_progress_photos")
      .select("id, taken_on, storage_path, note:notes")
      .eq("organization_id", organizationId)
      .eq("member_id", memberId)
      .order("taken_on", { ascending: false })
      .limit(limit),
  );
  if (!rows.length) return [];
  const { data: signed } = await supabase.storage
    .from(PROGRESS_BUCKET)
    .createSignedUrls(rows.map((r) => r.storage_path), 60 * 10);
  const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return rows.map((r) => ({ ...r, url: byPath.get(r.storage_path) ?? null }));
}

export async function uploadProgressPhoto(input: {
  organizationId: string;
  memberId: string;
  uri: string;
  mimeType?: string | null;
}) {
  const ext = input.mimeType === "image/png" ? "png" : "jpg";
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${input.organizationId}/${input.memberId}/${id}.${ext}`;
  const body = await (await fetch(input.uri)).arrayBuffer();
  const up = await supabase.storage
    .from(PROGRESS_BUCKET)
    .upload(path, body, { contentType: input.mimeType ?? "image/jpeg", upsert: false });
  if (up.error) throw new Error(up.error.message || "Could not upload that photo.");
  const { error } = await supabase.from("member_progress_photos").insert({
    organization_id: input.organizationId,
    member_id: input.memberId,
    taken_on: dayKey(),
    storage_path: path,
  });
  if (error) {
    // No orphaned object when the row is refused.
    await supabase.storage.from(PROGRESS_BUCKET).remove([path]);
    throw new Error(error.message || "Could not save that photo.");
  }
}

export async function deleteProgressPhoto(photo: Pick<ProgressPhoto, "id" | "storage_path">) {
  const { data, error } = await supabase.from("member_progress_photos").delete().eq("id", photo.id).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("That photo could not be deleted.");
  const rm = await supabase.storage.from(PROGRESS_BUCKET).remove([photo.storage_path]);
  if (rm.error) throw new Error(`The photo left your list, but its file was not removed: ${rm.error.message}`);
}

export async function getNotifications(userId: string) {
  return many<{ id: string; title: string; body: string | null; type: string | null; read_at: string | null; created_at: string }>(
    supabase
      .from("notifications")
      .select("id, title, body, type, read_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30),
  );
}

export async function getTrainer(trainerId: string | null) {
  if (!trainerId) return null;
  return one<Staff>(supabase.from("staff").select("id, name, job_role, phone, email").eq("id", trainerId).maybeSingle());
}

/**
 * Local water log. Kept on-device: hydration is personal, per-tap data with no
 * reporting or CRM use, so it does not justify a server table. AsyncStorage
 * keeps yesterday's and today's totals across restarts; the key holds one
 * JSON object of `YYYY-MM-DD -> ml`.
 */
export async function getWaterLog(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem("twoplus.water");
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export async function addWater(ml: number, day = dayKey()) {
  const log = await getWaterLog();
  log[day] = Math.max(0, (log[day] ?? 0) + ml);
  await AsyncStorage.setItem("twoplus.water", JSON.stringify(log));
  return log[day];
}

export async function getWaterToday() {
  return (await getWaterLog())[dayKey()] ?? 0;
}

/**
 * Self-service measurements. Migration 0015 grants members insert/update on
 * their own rows, so weight check-ins work without the front desk.
 */
export async function addMeasurement(input: {
  memberId: string;
  organizationId: string;
  weightKg: number;
  heightCm?: number | null;
  notes?: string;
}) {
  const row = await one<Measurement>(
    supabase
      .from("fitness_measurements")
      .insert({
        member_id: input.memberId,
        organization_id: input.organizationId,
        measured_on: dayKey(),
        weight_kg: input.weightKg,
        height_cm: input.heightCm ?? null,
        notes: input.notes?.slice(0, 500) ?? null,
      })
      .select(
        "id, measured_on, weight_kg, height_cm, body_fat_pct, chest_cm, waist_cm, hips_cm, arms_cm, thighs_cm, notes",
      )
      .single(),
  );
  if (!row) throw new Error("Could not save the check-in.");
  return row;
}

/**
 * Save a tracked run as a real workout session.
 *
 * The run gets the day's null-assignment slot: when the member also trained a
 * plan today, that session carries the assignment id and this one does not,
 * so the unique index on (member, day, coalesce(assignment)) accepts both.
 * A second run the same day extends the first instead of failing the index.
 */
export async function saveRun(input: {
  memberId: string;
  organizationId: string;
  durationMinutes: number;
  note: string;
}) {
  const today = dayKey();
  const existing = await many<WorkoutSession & { note: string | null }>(
    supabase
      .from("workout_sessions")
      .select("id, performed_on, duration_minutes, note, completed_at, plan_id")
      .eq("member_id", input.memberId)
      .eq("performed_on", today)
      .is("assignment_id", null)
      .limit(1),
  );
  if (existing[0]) {
    const prev = existing[0];
    // Retry after a lost response: this exact run (its note carries the start
    // time) is already in the row, so adding it again would double it.
    if (prev.note?.includes(input.note)) return prev.id;
    const duration = Math.min(
      1440,
      (prev.duration_minutes ?? 0) + Math.max(0, Math.round(input.durationMinutes)),
    );
    const note = [prev.note, input.note].filter(Boolean).join("\n").slice(0, 2000);
    const { error } = await supabase
      .from("workout_sessions")
      .update({ duration_minutes: duration, note, completed_at: new Date().toISOString() })
      .eq("id", prev.id);
    if (error) throw new Error(error.message);
    return prev.id;
  }

  const row = await one<{ id: string }>(
    supabase
      .from("workout_sessions")
      .insert({
        member_id: input.memberId,
        organization_id: input.organizationId,
        assignment_id: null,
        performed_on: today,
        duration_minutes: Math.max(0, Math.min(1440, Math.round(input.durationMinutes))),
        note: input.note.slice(0, 2000),
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .single(),
  );
  if (!row) throw new Error("Could not save the run.");
  return row.id;
}

/** Latest measurement is the baseline for BMI and trend arrows. */
export function bmiOf(weightKg: number | null, heightCm: number | null) {
  if (!weightKg || !heightCm) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/**
 * Your data: export and account deletion, the mobile twin of the web app's
 * Phase 18 section (src/lib/member-api.ts).
 *
 * Export gathers every structured record the member can read under RLS, with
 * the same 100,000-row ceiling the web export uses: a member asking for their
 * data gets all of it, not the last page the screens show. Progress photos are
 * not included (they live in storage buckets, and the mobile app has no photo
 * list yet); the web export covers them.
 */

/** Screen getters cap themselves for UI speed; an export must not. */
const EXPORT_LIMIT = 100_000;

export async function exportMyData(): Promise<string> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("Not signed in");
  const memberRow = await supabase.from("members").select("*").eq("user_id", user.user.id).maybeSingle();
  if (memberRow.error) throw new Error(memberRow.error.message);
  const member = memberRow.data as Record<string, unknown> | null;
  if (!member) throw new Error("No member record is linked to this account");
  const memberId = member.id as string;

  const [memberships, payments, attendance, measurements, sessions, plans, dietPlans, classes, invoices, photos] =
    await Promise.all([
      getMemberships(memberId),
      getPayments(memberId, EXPORT_LIMIT),
      getAttendance(memberId, EXPORT_LIMIT),
      getMeasurements(memberId, EXPORT_LIMIT),
      getRecentSessions(memberId, EXPORT_LIMIT),
      getActiveWorkoutPlan(memberId),
      getActiveDietPlan(memberId),
      getMyBookings(memberId),
      getInvoices(memberId, EXPORT_LIMIT),
      many<{ id: string; taken_on: string; note: string | null }>(
        supabase.from("member_progress_photos").select("id, taken_on, note:notes").eq("member_id", memberId).limit(EXPORT_LIMIT),
      ),
    ]);

  // Sets ride along per session, the way the web export embeds them.
  const withSets = await Promise.all(sessions.map((s) => getSets(s.id).then((sets) => ({ ...s, sets }))));
  const meals = await getMeals();
  const water = await getWaterLog();

  return JSON.stringify(
    {
      exported_on: new Date().toISOString(),
      // Curated, not select("*"): `notes` is what the desk wrote about the
      // member, and the web export deliberately leaves it out for the same
      // reason. On-device keys (meals, water) are included because the data
      // is the member's even though it never reached the server.
      profile: {
        first_name: member.first_name,
        last_name: member.last_name,
        email: member.email,
        phone: member.phone,
        date_of_birth: member.date_of_birth,
        gender: member.gender,
        address: member.address,
        emergency_contact_name: member.emergency_contact_name,
        emergency_contact_phone: member.emergency_contact_phone,
        member_code: member.member_code,
        member_since: member.joined_on,
        status: member.status,
      },
      memberships,
      payments,
      invoices,
      attendance,
      measurements,
      workout_sessions: withSets,
      workout_plan: plans,
      diet_plan: dietPlans,
      class_bookings: classes,
      // Which photos exist, never a link: signed URLs expire and must not
      // sit in a file the member forwards.
      progress_photos: photos,
      on_device: { meals, water },
      note: "Progress photo images are not embedded; this lists which ones exist. Meals and water were logged on this device only.",
    },
    null,
    2,
  );
}

/**
 * Delete the account through the 0016 RPC. Erases the member's identity,
 * training history and sign-in; payments stay with the gym as financial
 * records. Refuses gym owners with a readable error.
 */
export async function deleteMyAccount(): Promise<{ member_erased: boolean; photos_removed: number }> {
  const { data, error } = await supabase.rpc("delete_my_account");
  if (error) throw new Error(error.message || "Could not delete your account");
  return data as { member_erased: boolean; photos_removed: number };
}

/**
 * Everything this device keeps about a member: the offline cache screens fall
 * back to, the meal and water logs, and (web builds) the session copy. The
 * auth session itself lives in SecureStore or web localStorage and is cleared
 * by supabase.auth.signOut(); this clears the rest, so the next person who
 * opens the app on a shared phone cannot be served the previous member's
 * cached history offline.
 */
export async function wipeLocalMemberData() {
  const keys = await AsyncStorage.getAllKeys();
  const mine = keys.filter(
    (k) =>
      k === "twoplus.water" ||
      k === "twoplus.meals" ||
      k.startsWith(CACHE_PREFIX) ||
      k.startsWith(OUTBOX_PREFIX),
  );
  if (mine.length) await AsyncStorage.multiRemove(mine);
}
