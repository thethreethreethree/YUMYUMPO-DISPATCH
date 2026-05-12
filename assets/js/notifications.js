// =====================================================================
// YUMYUMPO Dispatch — Notification & Alert System
// Lightweight, realtime-friendly. Uses Supabase Realtime if connected;
// otherwise stores notifications in localStorage and dispatches an
// in-page event bus so the UI stays responsive in demo mode.
// =====================================================================
import { supabase, HAS_SUPABASE } from "./supabase.js";

const STORE_KEY = "ymp_notifications_v1";
const listeners = new Set();
let me = null;             // { type: 'restaurant'|'rider'|'admin', id: string, zones?: string[] }
let channel = null;
let mutedKinds = new Set(); // kinds the current recipient has muted

// ---------- Identity (who am I receiving notifications for) -----------
export function setRecipient(recipient) {
  me = recipient;
  if (HAS_SUPABASE) subscribeRealtime();
}

// Called by the notification-center on mount so client-side render/filters
// respect the user's mute preferences.
export function setMutedKinds(kinds) {
  mutedKinds = new Set(Array.isArray(kinds) ? kinds : []);
}
export function isMuted(kind) { return mutedKinds.has(kind); }

// ---------- Public API ------------------------------------------------
export async function listNotifications({ limit = 30, unreadOnly = false, includeMuted = false } = {}) {
  let rows;
  if (HAS_SUPABASE && me) {
    let q = supabase.from("notifications").select("*")
      .eq("recipient_type", me.type).eq("recipient_id", me.id)
      .order("created_at", { ascending: false }).limit(limit);
    if (unreadOnly) q = q.is("read_at", null);
    const { data, error } = await q;
    if (error) throw error;
    rows = data;
  } else {
    const all = readStore();
    const mine = me ? all.filter(n => n.recipient_type === me.type && n.recipient_id === me.id) : all;
    rows = (unreadOnly ? mine.filter(n => !n.read_at) : mine).slice(0, limit);
  }
  return includeMuted ? rows : rows.filter(n => !mutedKinds.has(n.kind));
}

export async function unreadCount() {
  const list = await listNotifications({ limit: 999, unreadOnly: true });
  return list.length;
}

export async function markRead(id) {
  if (HAS_SUPABASE) {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  } else {
    const all = readStore();
    const n = all.find(x => x.id === id);
    if (n) { n.read_at = new Date().toISOString(); writeStore(all); }
  }
  emit({ type: "update" });
}

export async function markAllRead() {
  if (HAS_SUPABASE && me) {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() })
      .eq("recipient_type", me.type).eq("recipient_id", me.id).is("read_at", null);
  } else {
    const all = readStore();
    const now = new Date().toISOString();
    all.forEach(n => { if (!me || (n.recipient_type === me.type && n.recipient_id === me.id)) n.read_at = n.read_at || now; });
    writeStore(all);
  }
  emit({ type: "update" });
}

export async function pushNotification(n) {
  // n: { recipient_type, recipient_id, kind, title, body?, request_id?, payload? }
  if (HAS_SUPABASE) {
    const { data, error } = await supabase.from("notifications").insert({
      recipient_type: n.recipient_type, recipient_id: n.recipient_id,
      kind: n.kind, title: n.title, body: n.body || null,
      request_id: n.request_id || null, payload: n.payload || null,
    }).select().single();
    if (error) throw error;
    return data;
  }
  const record = { id: cryptoRandom(), created_at: new Date().toISOString(), read_at: null, ...n };
  const all = readStore();
  all.unshift(record);
  writeStore(all.slice(0, 300));
  emit({ type: "incoming", notification: record });
  return record;
}

// ---------- Domain helpers — fan-out for delivery flow ----------------
// Build the standard `request_new` notification payload for a given rider.
function buildRequestNotice(req, rider, { preferred = false } = {}) {
  return {
    recipient_type: "rider", recipient_id: rider.id,
    kind: "request_new",
    title: preferred
      ? `🟡 First dibs — request near ${req.zone}`
      : `New delivery request near ${req.zone}`,
    body: `${req.restaurant || "A restaurant"} → ${req.dropoff}`,
    request_id: req.id,
    payload: { preferred, expires_in_seconds: 120 },
  };
}

// Notify online riders in the request's zone, biased toward the restaurant's
// preferred list. The flow:
//   1. If any PREFERRED riders are online + in-zone, ping ONLY them first.
//   2. After `openFanoutDelayMs` (default 30s), if the request is still
//      `Available`, fan out to the rest of the zone.
//   3. If no preferred riders are eligible, fall back to the open broadcast
//      immediately — restaurants without a preferred team aren't penalised.
//
// Returns { preferredCount, restCount, opened } where `opened` is true if
// the open wave fired immediately (i.e. no preferred eligibles).
export async function notifyRequestCreated(req, riders, {
  preferredIds = [],
  openFanoutDelayMs = 30000,
} = {}) {
  const inZone = (riders || []).filter(r =>
    (r.status === "online" || r.status === "available") &&
    r.zones?.includes(req.zone)
  );
  const prefSet = new Set(preferredIds);
  const preferred = inZone.filter(r => prefSet.has(r.id));
  const rest      = inZone.filter(r => !prefSet.has(r.id));

  // No preferred eligibles → standard open broadcast, done.
  if (!preferred.length) {
    await Promise.all(inZone.map(r => pushNotification(buildRequestNotice(req, r))));
    return { preferredCount: 0, restCount: inZone.length, opened: true };
  }

  // Ping the preferred wave now.
  await Promise.all(preferred.map(r => pushNotification(buildRequestNotice(req, r, { preferred: true }))));

  // Schedule the open wave. We re-check the request's status at fire-time
  // so an Accepted job never disturbs the rest of the zone.
  if (rest.length) {
    setTimeout(() => fanoutOpenWave(req, rest).catch(() => {}), openFanoutDelayMs);
  }
  return { preferredCount: preferred.length, restCount: rest.length, opened: false };
}

async function fanoutOpenWave(req, restRiders) {
  // If Supabase is wired, only fire when the request is still Available.
  if (HAS_SUPABASE && req.id) {
    const { data } = await supabase.from("delivery_requests")
      .select("status").eq("id", req.id).maybeSingle();
    if (!data || data.status !== "Available") return; // already accepted/cancelled
  }
  await Promise.all(restRiders.map(r => pushNotification(buildRequestNotice(req, r))));
}

export async function notifyRequestAccepted(req, restaurantId, riderName) {
  await pushNotification({
    recipient_type: "restaurant", recipient_id: restaurantId,
    kind: "request_accepted",
    title: `${riderName} accepted your delivery request.`,
    body: "Contact them via WhatsApp or call to confirm pickup.",
    request_id: req.id,
  });
}

export async function notifyDeliveryCompleted(req, restaurantId, riderName) {
  await pushNotification({
    recipient_type: "restaurant", recipient_id: restaurantId,
    kind: "delivery_completed",
    title: "Delivery marked completed.",
    body: `${riderName} completed the run to ${req.dropoff}.`,
    request_id: req.id,
  });
}

export async function notifyVerificationApproved(riderId) {
  return pushNotification({
    recipient_type: "rider", recipient_id: riderId,
    kind: "verification_approved",
    title: "Your verification has been approved.",
    body: "You're now a Verified Delivery Partner. Restaurants can find you.",
  });
}

// ---------- Realtime + event bus --------------------------------------
export function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(evt) { listeners.forEach(fn => { try { fn(evt); } catch {} }); }

function subscribeRealtime() {
  if (!HAS_SUPABASE || !me) return;
  if (channel) { supabase.removeChannel(channel); channel = null; }
  channel = supabase
    .channel("notifications:" + me.type + ":" + me.id)
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "notifications",
      filter: `recipient_id=eq.${me.id}`,
    }, (p) => {
      if (p.new.recipient_type !== me.type) return;
      emit({ type: "incoming", notification: p.new });
      maybeBrowserPush(p.new);
    })
    // Mark-as-read in another tab → reflect here without a refresh.
    .on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "notifications",
      filter: `recipient_id=eq.${me.id}`,
    }, (p) => {
      if (p.new?.recipient_type !== me.type) return;
      emit({ type: "update", notification: p.new });
    })
    // Notification was deleted (e.g. by admin cleanup) — refresh counts.
    .on("postgres_changes", {
      event: "DELETE", schema: "public", table: "notifications",
      filter: `recipient_id=eq.${me.id}`,
    }, (p) => {
      if (p.old?.recipient_type && p.old.recipient_type !== me.type) return;
      emit({ type: "delete", notification: p.old });
    })
    .subscribe();
}

// Tear down the realtime subscription — call on sign-out / page unload.
export function disconnectRealtime() {
  if (channel) { supabase.removeChannel(channel); channel = null; }
  me = null;
}

// Force a fresh fetch — used after the tab regains visibility.
export function pingRefresh() { emit({ type: "update" }); }

// ---------- Browser push (Notification API) ---------------------------
export async function enableBrowserPush() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const res = await Notification.requestPermission();
  return res === "granted";
}

function maybeBrowserPush(n) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (mutedKinds.has(n.kind)) return;
  // only push when the tab is not focused
  if (document.visibilityState === "visible") return;
  try {
    new Notification(n.title, {
      body: n.body || "",
      icon: "./assets/favicon.svg",
      tag: n.id,
    });
  } catch {}
}

// ---------- Persistence + utils ---------------------------------------
function readStore()  { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch { return []; } }
function writeStore(arr) { localStorage.setItem(STORE_KEY, JSON.stringify(arr)); }
function cryptoRandom() { return (crypto.randomUUID?.() || ("n_" + Math.random().toString(36).slice(2) + Date.now())); }

// ---------- Display helpers -------------------------------------------
export const KIND_META = {
  request_new:           { icon:"📥", tone:"yellow",  label:"New request" },
  request_accepted:      { icon:"✅", tone:"green",   label:"Accepted" },
  request_declined:      { icon:"↩️", tone:"gray",    label:"Declined" },
  request_expired:       { icon:"⏱️", tone:"gray",    label:"Expired" },
  request_cancelled:     { icon:"⛔", tone:"red",     label:"Cancelled" },
  rider_arrived:         { icon:"📍", tone:"yellow",  label:"Arrived" },
  delivery_completed:    { icon:"🎉", tone:"green",   label:"Delivered" },
  no_response:           { icon:"😶", tone:"gray",    label:"No response" },
  preferred_online:      { icon:"⭐", tone:"yellow",  label:"Preferred online" },
  preferred_unavailable: { icon:"🌙", tone:"gray",    label:"Preferred offline" },
  rider_zone_changed:    { icon:"🗺️", tone:"gray",    label:"Zone changed" },
  rider_suspended:       { icon:"⚠️", tone:"red",     label:"Rider suspended" },
  verification_approved: { icon:"✔", tone:"green",   label:"Verified" },
  verification_rejected: { icon:"✖", tone:"red",     label:"Verification rejected" },
  account_warning:       { icon:"⚠", tone:"red",     label:"Warning" },
  profile_incomplete:    { icon:"📝", tone:"yellow",  label:"Profile" },
  new_rider_nearby:      { icon:"🛵", tone:"yellow",  label:"New rider nearby" },
  new_restaurant_nearby: { icon:"🏪", tone:"yellow",  label:"New restaurant nearby" },
  system:                { icon:"ℹ️", tone:"gray",    label:"System" },
};

export function timeAgo(iso) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60)    return Math.floor(d) + "s ago";
  if (d < 3600)  return Math.floor(d / 60) + "m ago";
  if (d < 86400) return Math.floor(d / 3600) + "h ago";
  return Math.floor(d / 86400) + "d ago";
}
