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
  // The DB trigger `public.handle_new_user` reads role/display_name/phone/whatsapp
  // from raw_user_meta_data and creates the matching restaurants/riders row.
  // This is the only safe path when email confirmation is enabled — the client
  // is not yet authenticated at this point, so any RLS-gated insert would fail.
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: {
      data: {
        role,
        display_name: displayName,
        phone: phone || null,
        whatsapp: whatsapp || null,
      },
      emailRedirectTo: window.location.origin + "/auth.html?confirmed=1",
    },
  });
  if (error) throw error;
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

// Sends a password-reset email. The link in the email lands back on /auth.html;
// supabase-js auto-detects the recovery token (detectSessionInUrl) and creates
// a short-lived session that can only call updateUser({password}).
export async function sendPasswordReset(email) {
  if (!HAS_SUPABASE) throw new Error("Auth not configured");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/auth.html?reset=1",
  });
  if (error) throw error;
}

// Called from the "set a new password" form after the user clicks the reset link.
export async function updatePassword(newPassword) {
  if (!HAS_SUPABASE) throw new Error("Auth not configured");
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function signOut() {
  if (!HAS_SUPABASE) return;
  await supabase.auth.signOut();
  cachedProfile = null;
  location.href = "./index.html";
}

// Callback receives (session, event). Event values: 'INITIAL_SESSION',
// 'SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'USER_UPDATED', 'PASSWORD_RECOVERY'.
export function onAuthChange(cb) {
  if (!HAS_SUPABASE) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    cachedProfile = null;
    // Keep error-monitoring context in sync with the session.
    import("./monitoring.js").then(({ setMonitoringUser }) => {
      setMonitoringUser(session?.user ? {
        id: session.user.id,
        email: session.user.email,
        role: session.user.user_metadata?.role || null,
      } : null);
    }).catch(() => {});
    cb(session, event);
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
