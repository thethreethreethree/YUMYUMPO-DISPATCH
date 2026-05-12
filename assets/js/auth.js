// =====================================================================
// Auth — thin wrapper around Supabase Auth + role-aware session.
// A user has either a `restaurants` row or a `riders` row keyed by user_id.
// =====================================================================
import { supabase, HAS_SUPABASE } from "./supabase.js";

let cachedProfile = null;

export function isConfigured() { return HAS_SUPABASE; }

export async function getSession() {
  if (!HAS_SUPABASE) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getUser() {
  const s = await getSession();
  return s?.user || null;
}

export async function signUp({ email, password, role, displayName, phone, whatsapp }) {
  if (!HAS_SUPABASE) throw new Error("Auth not configured");
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { role, display_name: displayName } },
  });
  if (error) throw error;
  const user = data.user;
  if (!user) return data;

  // Insert role-specific profile row. Trigger-friendly upsert by user_id.
  if (role === "restaurant") {
    await supabase.from("restaurants").upsert({
      user_id: user.id, name: displayName, contact_phone: phone, whatsapp,
    }, { onConflict: "user_id" });
  } else if (role === "rider") {
    await supabase.from("riders").upsert({
      user_id: user.id, name: displayName, phone, whatsapp,
      vehicle_type: "motorcycle", availability_status: "offline",
      verification_status: "pending",
    }, { onConflict: "user_id" });
  }
  cachedProfile = null;
  return data;
}

export async function signIn({ email, password }) {
  if (!HAS_SUPABASE) throw new Error("Auth not configured");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  cachedProfile = null;
  return data;
}

export async function signInMagicLink({ email, redirectTo }) {
  if (!HAS_SUPABASE) throw new Error("Auth not configured");
  const { error } = await supabase.auth.signInWithOtp({
    email, options: { emailRedirectTo: redirectTo || window.location.origin + "/auth.html" },
  });
  if (error) throw error;
}

export async function signOut() {
  if (!HAS_SUPABASE) return;
  await supabase.auth.signOut();
  cachedProfile = null;
  location.href = "./index.html";
}

export function onAuthChange(cb) {
  if (!HAS_SUPABASE) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_evt, session) => {
    cachedProfile = null;
    cb(session);
  });
  return () => data.subscription.unsubscribe();
}

// Returns { role, profile } where profile is a row from `restaurants` or `riders`.
export async function getCurrentProfile() {
  if (cachedProfile) return cachedProfile;
  const user = await getUser();
  if (!user) return null;
  const role = user.user_metadata?.role;
  let table = null;
  if (role === "restaurant") table = "restaurants";
  if (role === "rider") table = "riders";
  if (role === "admin") return (cachedProfile = { role: "admin", profile: { id: user.id, name: user.email } });
  if (!table) {
    // Probe both — handles older accounts without metadata.
    const rest = await supabase.from("restaurants").select("*").eq("user_id", user.id).maybeSingle();
    if (rest.data) return (cachedProfile = { role: "restaurant", profile: rest.data });
    const rid = await supabase.from("riders").select("*").eq("user_id", user.id).maybeSingle();
    if (rid.data) return (cachedProfile = { role: "rider", profile: rid.data });
    return null;
  }
  const { data, error } = await supabase.from(table).select("*").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  cachedProfile = data ? { role, profile: data } : null;
  return cachedProfile;
}

// Page-level guard. Redirects to auth.html if not signed in or wrong role.
export async function requireAuth(expectedRole) {
  if (!HAS_SUPABASE) return null; // graceful no-op when keys are missing
  const session = await getSession();
  if (!session) {
    location.href = "./auth.html?next=" + encodeURIComponent(location.pathname + location.search);
    return null;
  }
  const me = await getCurrentProfile();
  if (expectedRole && me?.role !== expectedRole) {
    location.href = "./auth.html?wrong_role=1";
    return null;
  }
  return me;
}

export function invalidateProfile() { cachedProfile = null; }
