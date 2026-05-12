// =====================================================================
// Data API — Supabase-backed in production; local fallback in dev mode.
// Every domain action is exposed through this module so dashboards stay
// thin and side-effects stay testable.
// =====================================================================
import { supabase, HAS_SUPABASE } from "./supabase.js";
import { RIDERS, REQUESTS, ZONES, VEHICLES } from "./mock-data.js";

export const enums = { ZONES, VEHICLES };
const isProd = () => HAS_SUPABASE;

// -------------------- ZONES (cached) ---------------------------------
let zonesCache = null;
export async function getZones() {
  if (zonesCache) return zonesCache;
  if (isProd()) {
    const { data, error } = await supabase.from("rider_zones").select("zone, city, active").eq("active", true).order("zone");
    if (error) throw error;
    zonesCache = data.map(r => r.zone);
    return zonesCache;
  }
  return (zonesCache = ZONES);
}

// -------------------- RIDERS -----------------------------------------
export async function fetchRiders(filters = {}) {
  if (isProd()) {
    let q = supabase.from("riders").select("*").order("rating", { ascending: false });
    if (filters.status)       q = q.eq("availability_status", filters.status);
    if (filters.vehicle)      q = q.eq("vehicle_type", filters.vehicle);
    if (filters.zone)         q = q.contains("delivery_zones", [filters.zone]);
    if (filters.verifiedOnly) q = q.eq("verification_status", "verified");
    if (filters.limit)        q = q.limit(filters.limit);
    const { data, error } = await q;
    if (error) throw error;
    return data.map(normalizeRiderRow);
  }
  return RIDERS.filter(r =>
    (!filters.status  || r.status === filters.status) &&
    (!filters.vehicle || r.vehicle === filters.vehicle) &&
    (!filters.zone    || r.zones.includes(filters.zone)) &&
    (!filters.verifiedOnly || r.verified)
  );
}

export async function fetchRider(id) {
  if (isProd()) {
    const { data, error } = await supabase.from("riders").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? normalizeRiderRow(data) : null;
  }
  return RIDERS.find(r => r.id === id);
}

export async function updateRiderProfile(riderId, patch) {
  if (!isProd()) return patch;
  const { data, error } = await supabase.from("riders").update(patch).eq("id", riderId).select().single();
  if (error) throw error;
  return normalizeRiderRow(data);
}

export async function setRiderStatus(riderId, status) {
  if (!isProd()) return { id: riderId, status };
  const { data, error } = await supabase.from("riders")
    .update({ availability_status: status }).eq("id", riderId).select().single();
  if (error) throw error;
  return normalizeRiderRow(data);
}

// Normalize DB row → UI shape used by components.js
function normalizeRiderRow(r) {
  return {
    id: r.id, name: r.name,
    photo: r.profile_photo || "https://i.pravatar.cc/240?u=" + r.id,
    vehicle: r.vehicle_type,
    zones: r.delivery_zones || [],
    status: r.availability_status,
    rating: Number(r.rating ?? 0),
    completed: r.completed_deliveries ?? 0,
    verified: r.verification_status === "verified",
    phone: r.phone, whatsapp: r.whatsapp,
    base_fee: Number(r.base_fee ?? 0),
    per_km_fee: Number(r.per_km_fee ?? 0),
    preferred_count: r.preferred_count ?? 0,
    raw: r,
  };
}

// -------------------- RESTAURANTS ------------------------------------
export async function getRestaurantByUser(userId) {
  if (!isProd()) return { id: "demo", name: "Demo Restaurant" };
  const { data, error } = await supabase.from("restaurants").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateRestaurant(restaurantId, patch) {
  if (!isProd()) return patch;
  const { data, error } = await supabase.from("restaurants").update(patch).eq("id", restaurantId).select().single();
  if (error) throw error;
  return data;
}

// -------------------- DELIVERY REQUESTS ------------------------------
export async function createDeliveryRequest(payload) {
  // payload: { restaurant_id, zone, pickup, dropoff, notes? }
  if (isProd()) {
    const row = {
      restaurant_id: payload.restaurant_id,
      zone: payload.zone, pickup: payload.pickup, dropoff: payload.dropoff,
      notes: payload.notes || null, status: "Available",
    };
    const { data, error } = await supabase.from("delivery_requests").insert(row).select().single();
    if (error) throw error;
    await logActivity(data.id, "request_created", { zone: data.zone });
    return data;
  }
  const row = { id: "d" + Date.now(), status: "Available", created: new Date().toISOString(), ...payload };
  REQUESTS.unshift(row);
  return row;
}

export async function fetchRequests(filters = {}) {
  // Guard: callers pass `openInZones: rider.zones` for the driver feed. If the
  // driver hasn't set any zones yet, an empty array would translate to
  // `.in('zone', [])` which Postgres / PostgREST treats as match-all — so a
  // newly-confirmed driver with zero zones would suddenly see every open
  // request in the network. Short-circuit to an empty result instead.
  if (Array.isArray(filters.openInZones) && filters.openInZones.length === 0) {
    return [];
  }

  if (isProd()) {
    let q = supabase.from("delivery_requests").select("*").order("created_at", { ascending: false });
    if (filters.restaurant_id) q = q.eq("restaurant_id", filters.restaurant_id);
    if (filters.rider_id)      q = q.eq("rider_id", filters.rider_id);
    if (filters.status)        q = q.eq("status", filters.status);
    if (filters.openInZones)   q = q.eq("status", "Available").in("zone", filters.openInZones);
    if (filters.limit)         q = q.limit(filters.limit);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
  return REQUESTS;
}

export async function acceptRequest(requestId, riderId) {
  if (!isProd()) {
    const r = REQUESTS.find(x => x.id === requestId);
    if (!r || r.status !== "Available") return null;
    r.status = "Accepted"; r.rider = riderId; r.accepted_at = new Date().toISOString();
    return r;
  }
  // Race-safe: only the first writer whose `status='Available'` predicate still
  // matches will see a row come back. Subsequent writers get `data === null`
  // (not an error) so we can surface a friendly "already taken" message.
  const { data, error } = await supabase.from("delivery_requests")
    .update({ status: "Accepted", rider_id: riderId, accepted_at: new Date().toISOString() })
    .eq("id", requestId).eq("status", "Available")
    .select().maybeSingle();
  if (error) throw error;
  if (!data) return null;
  await logActivity(requestId, "request_accepted", { rider_id: riderId });
  return data;
}

export async function markPickedUp(requestId) {
  if (!isProd()) { const r = REQUESTS.find(x => x.id === requestId); if (r) r.status = "Picked Up"; return r; }
  const { data, error } = await supabase.from("delivery_requests")
    .update({ status: "Picked Up", picked_up_at: new Date().toISOString() })
    .eq("id", requestId).select().single();
  if (error) throw error;
  await logActivity(requestId, "picked_up");
  return data;
}

export async function markDelivered(requestId) {
  if (!isProd()) { const r = REQUESTS.find(x => x.id === requestId); if (r) r.status = "Delivered"; return r; }
  const { data, error } = await supabase.from("delivery_requests")
    .update({ status: "Delivered", delivered_at: new Date().toISOString() })
    .eq("id", requestId).select().single();
  if (error) throw error;
  await logActivity(requestId, "delivered");
  return data;
}

export async function cancelRequest(requestId) {
  if (!isProd()) { const r = REQUESTS.find(x => x.id === requestId); if (r) r.status = "Cancelled"; return r; }
  const { data, error } = await supabase.from("delivery_requests")
    .update({ status: "Cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", requestId).select().single();
  if (error) throw error;
  await logActivity(requestId, "cancelled");
  return data;
}

async function logActivity(request_id, event, metadata) {
  try { await supabase.from("delivery_activity").insert({ request_id, event, metadata: metadata || null }); } catch {}
}

// -------------------- PREFERRED RIDERS -------------------------------
export async function fetchPreferredRiderIds(restaurantId) {
  if (!isProd()) return JSON.parse(localStorage.getItem("preferred_demo") || "[]");
  const { data, error } = await supabase.from("preferred_riders").select("rider_id").eq("restaurant_id", restaurantId);
  if (error) throw error;
  return data.map(r => r.rider_id);
}

export async function togglePreferred(restaurantId, riderId) {
  if (!isProd()) {
    const list = JSON.parse(localStorage.getItem("preferred_demo") || "[]");
    const i = list.indexOf(riderId);
    if (i === -1) list.push(riderId); else list.splice(i, 1);
    localStorage.setItem("preferred_demo", JSON.stringify(list));
    return list;
  }
  const existing = await supabase.from("preferred_riders")
    .select("rider_id").match({ restaurant_id: restaurantId, rider_id: riderId }).maybeSingle();
  if (existing.data) {
    await supabase.from("preferred_riders").delete().match({ restaurant_id: restaurantId, rider_id: riderId });
  } else {
    await supabase.from("preferred_riders").insert({ restaurant_id: restaurantId, rider_id: riderId });
  }
  return fetchPreferredRiderIds(restaurantId);
}

// -------------------- RATINGS ----------------------------------------
export async function submitRating({ restaurant_id, rider_id, request_id, metric, value }) {
  if (!isProd()) return true;
  const { error } = await supabase.from("rider_ratings").insert({ restaurant_id, rider_id, request_id, metric, value });
  if (error) throw error;
  return true;
}

// -------------------- VERIFICATIONS ----------------------------------
export async function uploadVerificationFile(userId, file, kind) {
  if (!isProd() || !file) return null;
  const path = `${userId}/${kind}-${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, "_")}`;
  const { error } = await supabase.storage.from("verifications").upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

export async function uploadAvatar(userId, file) {
  if (!isProd() || !file) return null;
  const path = `${userId}/avatar-${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, "_")}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}

export async function submitVerification({ rider_id, id_url, selfie_url, video_url, notes }) {
  if (!isProd()) return true;
  const { error } = await supabase.from("rider_verifications").insert({ rider_id, id_url, selfie_url, video_url, notes });
  if (error) throw error;
  return true;
}

export async function fetchPendingVerifications() {
  if (!isProd()) return [];
  const { data, error } = await supabase.from("rider_verifications")
    .select("*, riders(*)").eq("status", "pending").order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function decideVerification(verificationId, riderId, decision) {
  if (!isProd()) return true;
  const status = decision === "approve" ? "verified" : "rejected";
  const { error: e1 } = await supabase.from("rider_verifications")
    .update({ status, reviewed_at: new Date().toISOString() }).eq("id", verificationId);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from("riders")
    .update({ verification_status: status }).eq("id", riderId);
  if (e2) throw e2;
  return true;
}

// -------------------- HOMEPAGE STATS ---------------------------------
// Anonymous-readable aggregates for the public homepage. Driven by the
// existing RLS policies that expose verified riders + active zones to
// everyone. Returns sensible fallbacks in mock / preview mode.
export async function getHomepageStats() {
  if (!isProd()) {
    return {
      onlineDrivers: RIDERS.filter(r => r.verified && (r.status === "online" || r.status === "available")).length,
      activeZones: ZONES.length,
      verifiedDrivers: RIDERS.filter(r => r.verified).length,
      zoneCounts: Object.fromEntries(ZONES.map(z => [z, RIDERS.filter(r => r.verified && r.zones.includes(z)).length])),
    };
  }
  const [online, zones, verified, allRiders] = await Promise.all([
    supabase.from("riders").select("id", { count: "exact", head: true })
      .eq("verification_status", "verified").in("availability_status", ["online", "available"]),
    supabase.from("rider_zones").select("zone", { count: "exact" }).eq("active", true),
    supabase.from("riders").select("id", { count: "exact", head: true })
      .eq("verification_status", "verified"),
    supabase.from("riders").select("delivery_zones").eq("verification_status", "verified"),
  ]);
  if (online.error)    throw online.error;
  if (zones.error)     throw zones.error;
  if (verified.error)  throw verified.error;
  if (allRiders.error) throw allRiders.error;

  // Per-zone driver counts — done client-side from the riders we just fetched
  // (postgres array_agg / unnest would need a SQL function; this is faster to
  // ship and still cheap for hundreds of riders).
  const zoneCounts = {};
  (zones.data || []).forEach(z => { zoneCounts[z.zone] = 0; });
  (allRiders.data || []).forEach(r => {
    (r.delivery_zones || []).forEach(z => {
      if (zoneCounts[z] !== undefined) zoneCounts[z] += 1;
    });
  });

  return {
    onlineDrivers: online.count ?? 0,
    activeZones: zones.count ?? (zones.data || []).length,
    verifiedDrivers: verified.count ?? 0,
    zoneCounts,
    zones: (zones.data || []).map(z => z.zone),
  };
}

// -------------------- ANALYTICS --------------------------------------
export async function trackEvent(event, payload, actor) {
  if (!isProd()) return;
  try {
    await supabase.from("analytics_events").insert({
      event, payload, actor_type: actor?.type || null, actor_id: actor?.id || null,
    });
  } catch {}
}
